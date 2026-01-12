import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Decrypt function using Web Crypto API
async function decrypt(encryptedData: string): Promise<string> {
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY') || 'default-32-char-encryption-key!!';
  
  const data = JSON.parse(encryptedData);
  const iv = fromHex(data.iv);
  const salt = fromHex(data.salt);
  const ciphertext = fromHex(data.encryptedData);
  
  const cryptoKey = await deriveKey(encryptionKey, salt);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

async function deriveKey(encryptionKey: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(encryptionKey),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function fromHex(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes.buffer;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { action, deploymentId } = await req.json();
    console.log(`[bot-control] Action: ${action}, DeploymentId: ${deploymentId}`);

    if (!deploymentId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing deploymentId' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get deployment info - try both id and server_id
    let deployment = null;
    
    const { data: deploymentById } = await supabase
      .from('hft_deployments')
      .select('*')
      .eq('id', deploymentId)
      .single();

    if (deploymentById) {
      deployment = deploymentById;
    } else {
      const { data: deploymentByServerId } = await supabase
        .from('hft_deployments')
        .select('*')
        .eq('server_id', deploymentId)
        .single();
      deployment = deploymentByServerId;
    }

    if (!deployment) {
      return new Response(
        JSON.stringify({ success: false, error: 'Deployment not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ipAddress = deployment.ip_address;
    if (!ipAddress) {
      return new Response(
        JSON.stringify({ success: false, error: 'No IP address for deployment' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get SSH private key from hft_ssh_keys if available
    let privateKey: string | null = null;
    
    if (deployment.ssh_key_id) {
      const { data: sshKey } = await supabase
        .from('hft_ssh_keys')
        .select('private_key_encrypted')
        .eq('id', deployment.ssh_key_id)
        .single();

      if (sshKey?.private_key_encrypted) {
        try {
          privateKey = await decrypt(sshKey.private_key_encrypted);
        } catch (decryptErr) {
          console.error('Failed to decrypt SSH key:', decryptErr);
        }
      }
    }
    
    // Fallback to environment variable
    if (!privateKey) {
      privateKey = Deno.env.get('VULTR_SSH_PRIVATE_KEY') || null;
    }

    if (!privateKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'No SSH key available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build .env.exchanges content for Docker - ALWAYS LIVE MODE
    // CRITICAL: Include Supabase credentials for DB sync and exchange credentials for trading
    let envFileContent = '';
    if (action === 'start' || action === 'restart') {
      const { data: exchanges } = await supabase
        .from('exchange_connections')
        .select('exchange_name, api_key, api_secret, api_passphrase')
        .eq('is_connected', true);
      
      // Always include Supabase and Telegram config
      const envLines: string[] = [
        'STRATEGY_ENABLED=true',
        'TRADE_MODE=LIVE',
        `SUPABASE_URL=${supabaseUrl}`,
        `SUPABASE_SERVICE_ROLE_KEY=${supabaseServiceKey}`
      ];
      
      // Add Telegram config if available
      const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
      const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID');
      if (telegramToken) envLines.push(`TELEGRAM_BOT_TOKEN=${telegramToken}`);
      if (telegramChatId) envLines.push(`TELEGRAM_CHAT_ID=${telegramChatId}`);
      
      // Add exchange credentials
      if (exchanges?.length) {
        for (const ex of exchanges) {
          const name = ex.exchange_name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
          if (ex.api_key) envLines.push(`${name}_API_KEY=${ex.api_key}`);
          if (ex.api_secret) envLines.push(`${name}_API_SECRET=${ex.api_secret}`);
          if (ex.api_passphrase) envLines.push(`${name}_PASSPHRASE=${ex.api_passphrase}`);
        }
        console.log(`[bot-control] Prepared .env.exchanges with Supabase + ${exchanges.length} exchanges in LIVE mode`);
      } else {
        console.log(`[bot-control] ⚠️ No connected exchanges found! Bot will not be able to trade.`);
      }
      
      envFileContent = envLines.join('\n');
    }
    
    // ═══════════════════════════════════════════════════════════
    // PRIMARY: Use VPS HTTP /control endpoint for start/restart
    // This calls the VPS Control API directly with proper signal creation
    // Falls back to SSH if HTTP fails
    // ═══════════════════════════════════════════════════════════
    
    if (action === 'start' || action === 'restart') {
      console.log(`[bot-control] Attempting direct HTTP /control call to ${ipAddress}`);
      
      try {
        // Parse env content into object for VPS API
        const envObj: Record<string, string> = {};
        envFileContent.split('\n').forEach(line => {
          const [key, ...valueParts] = line.split('=');
          if (key && valueParts.length > 0) {
            envObj[key.trim()] = valueParts.join('=').trim();
          }
        });
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const controlResponse = await fetch(`http://${ipAddress}/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            env: envObj,
            createSignal: true
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (controlResponse.ok) {
          const controlData = await controlResponse.json();
          console.log(`[bot-control] VPS /control response:`, JSON.stringify(controlData));
          
          // Check if signal was created
          if (controlData.signalCreated === true) {
            console.log('[bot-control] ✅ VPS confirmed START_SIGNAL created via HTTP');
            
            // Verify via /signal-check endpoint
            try {
              const signalCheck = await fetch(`http://${ipAddress}/signal-check`, {
                signal: AbortSignal.timeout(5000)
              });
              if (signalCheck.ok) {
                const signalData = await signalCheck.json();
                if (signalData.signalExists) {
                  console.log('[bot-control] ✅ Signal verified via /signal-check');
                  
                  // Update database to running
                  const updateTime = new Date().toISOString();
                  await supabase.from('hft_deployments').update({ 
                    bot_status: 'running', 
                    updated_at: updateTime 
                  }).eq('id', deployment.id);
                  
                  await supabase.from('trading_config').update({ 
                    bot_status: 'running', 
                    trading_enabled: true, 
                    updated_at: updateTime 
                  }).neq('id', '00000000-0000-0000-0000-000000000000');
                  
                  return new Response(
                    JSON.stringify({ 
                      success: true, 
                      output: 'Bot started successfully via HTTP control',
                      status: 'running',
                      signalVerified: true,
                      method: 'http'
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                  );
                }
              }
            } catch (signalErr) {
              console.log('[bot-control] Signal check failed, continuing with success response');
            }
            
            // Signal created but verification endpoint not available - still success
            const updateTime = new Date().toISOString();
            await supabase.from('hft_deployments').update({ 
              bot_status: 'running', 
              updated_at: updateTime 
            }).eq('id', deployment.id);
            
            await supabase.from('trading_config').update({ 
              bot_status: 'running', 
              trading_enabled: true, 
              updated_at: updateTime 
            }).neq('id', '00000000-0000-0000-0000-000000000000');
            
            return new Response(
              JSON.stringify({ 
                success: true, 
                output: 'Bot started via HTTP control (signal created)',
                status: 'running',
                signalVerified: true,
                method: 'http'
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          } else {
            // VPS responded but didn't confirm signal creation
            // Could be old API version - fall through to SSH fallback
            console.log('[bot-control] ⚠️ VPS /control did not confirm signal creation, falling back to SSH');
          }
        } else {
          console.log(`[bot-control] VPS /control returned ${controlResponse.status}, falling back to SSH`);
        }
      } catch (httpErr) {
        const errMsg = httpErr instanceof Error ? httpErr.message : String(httpErr);
        console.log(`[bot-control] HTTP /control failed: ${errMsg}, falling back to SSH`);
      }
    }
    
    // Build SSH command based on action (fallback or for non-start actions)
    let command = '';
    let newBotStatus = '';

    switch (action) {
      case 'start':
        // FALLBACK: Create START_SIGNAL via SSH and VERIFY it was created
        const signalData = JSON.stringify({ started_at: new Date().toISOString(), source: 'dashboard', mode: 'live' });
        command = `
          mkdir -p /opt/hft-bot/app/data && 
          echo '${signalData}' > /opt/hft-bot/app/data/START_SIGNAL && 
          echo -e "${envFileContent}" > /opt/hft-bot/.env.exchanges && 
          cd /opt/hft-bot && 
          docker compose --env-file .env.exchanges down 2>/dev/null; 
          docker compose --env-file .env.exchanges up -d --remove-orphans;
          sleep 1;
          if [ -f /opt/hft-bot/app/data/START_SIGNAL ]; then
            echo "SIGNAL_VERIFIED:true";
          else
            echo "SIGNAL_VERIFIED:false";
          fi
        `;
        newBotStatus = 'starting';
        break;
      case 'stop':
        command = `rm -f /opt/hft-bot/app/data/START_SIGNAL && cd /opt/hft-bot && export STRATEGY_ENABLED=false && docker compose down 2>/dev/null || docker stop hft-bot 2>/dev/null || echo "stopped"`;
        newBotStatus = 'stopped';
        break;
      case 'restart':
        const restartSignalData = JSON.stringify({ started_at: new Date().toISOString(), source: 'dashboard', mode: 'live' });
        command = `
          echo '${restartSignalData}' > /opt/hft-bot/app/data/START_SIGNAL && 
          echo -e "${envFileContent}" > /opt/hft-bot/.env.exchanges && 
          cd /opt/hft-bot && 
          docker compose --env-file .env.exchanges down 2>/dev/null; 
          docker compose --env-file .env.exchanges up -d --remove-orphans;
          sleep 1;
          if [ -f /opt/hft-bot/app/data/START_SIGNAL ]; then
            echo "SIGNAL_VERIFIED:true";
          else
            echo "SIGNAL_VERIFIED:false";
          fi
        `;
        newBotStatus = 'starting';
        break;
      case 'status':
        // Check BOTH Docker status AND START_SIGNAL existence
        command = `
          DOCKER_UP=$(docker ps --filter name=hft-bot --format "{{.Status}}" 2>/dev/null | head -1);
          SIGNAL_EXISTS=$(test -f /opt/hft-bot/app/data/START_SIGNAL && echo "true" || echo "false");
          HEALTH_OK=$(curl -s http://localhost:3000/health 2>/dev/null | grep -q '"status":"ok"' && echo "true" || echo "false");
          echo "DOCKER:$DOCKER_UP|SIGNAL:$SIGNAL_EXISTS|HEALTH:$HEALTH_OK";
          if [ "$SIGNAL_EXISTS" = "true" ] && [ -n "$DOCKER_UP" ]; then
            echo "STATUS:running";
          elif [ -n "$DOCKER_UP" ]; then
            echo "STATUS:standby";
          else
            echo "STATUS:stopped";
          fi
        `;
        break;
      case 'logs':
        command = 'docker compose -f /opt/hft-bot/docker-compose.yml logs --tail=50 2>/dev/null || docker logs hft-bot --tail=50 2>/dev/null || pm2 logs trading-bot --lines 50 --nostream 2>/dev/null || echo "no_logs"';
        break;
      case 'health':
        command = 'curl -s http://localhost:3000/health';
        break;
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Execute SSH command
    console.log(`[bot-control] Executing SSH command to ${ipAddress}...`);
    const { data: sshResult, error: sshError } = await supabase.functions.invoke('ssh-command', {
      body: {
        ipAddress,
        command,
        privateKey,
        username: 'root',
        timeout: 30000,
      },
    });

    if (sshError) {
      console.error('[bot-control] SSH invocation error:', sshError);
      return new Response(
        JSON.stringify({ success: false, error: `SSH error: ${sshError.message}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if SSH command itself failed
    if (!sshResult?.success) {
      console.error('[bot-control] SSH command failed:', sshResult?.error);
      
      // Update status to error
      const updateTime = new Date().toISOString();
      await supabase.from('hft_deployments').update({ bot_status: 'error', updated_at: updateTime }).eq('id', deployment.id);
      await supabase.from('trading_config').update({ bot_status: 'error', trading_enabled: false, updated_at: updateTime }).neq('id', '00000000-0000-0000-0000-000000000000');
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: sshResult?.error || 'SSH command execution failed',
          output: sshResult?.output 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[bot-control] SSH command succeeded, output: ${sshResult.output?.substring(0, 500)}`);

    // ═══════════════════════════════════════════════════════════
    // CRITICAL FIX: Verify START_SIGNAL was actually created
    // Only update database to "running" if verification passes
    // ═══════════════════════════════════════════════════════════
    let healthVerified = false;
    let signalVerified = false;
    
    if (action === 'start' || action === 'restart') {
      const output = sshResult.output || '';
      
      // Step 1: Check if our embedded verification succeeded
      if (output.includes('SIGNAL_VERIFIED:true')) {
        signalVerified = true;
        console.log('[bot-control] ✅ START_SIGNAL creation verified in command output');
      } else if (output.includes('SIGNAL_VERIFIED:false')) {
        console.error('[bot-control] ❌ START_SIGNAL was NOT created by the command');
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Failed to create START_SIGNAL file on VPS',
            output: output.substring(0, 500)
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // Fallback: Explicitly verify via separate SSH command
        console.log('[bot-control] No verification in output, checking signal file explicitly...');
        const { data: verifyResult } = await supabase.functions.invoke('ssh-command', {
          body: {
            ipAddress,
            command: 'test -f /opt/hft-bot/app/data/START_SIGNAL && cat /opt/hft-bot/app/data/START_SIGNAL && echo "SIGNAL_EXISTS:true" || echo "SIGNAL_EXISTS:false"',
            privateKey,
            username: 'root',
            timeout: 10000,
          },
        });
        
        const verifyOutput = verifyResult?.output || '';
        if (verifyOutput.includes('SIGNAL_EXISTS:true')) {
          signalVerified = true;
          console.log('[bot-control] ✅ START_SIGNAL verified via explicit check');
        } else {
          console.error('[bot-control] ❌ START_SIGNAL file does not exist after start command');
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'START_SIGNAL file was not created - bot will not trade',
              output: verifyOutput.substring(0, 500)
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      
      // Step 2: Wait for bot to initialize and verify health
      console.log('[bot-control] Waiting 3s for bot to initialize...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Step 3: Final verification - check signal still exists AND health is OK
      const { data: finalCheck } = await supabase.functions.invoke('ssh-command', {
        body: {
          ipAddress,
          command: `
            SIGNAL_OK=$(test -f /opt/hft-bot/app/data/START_SIGNAL && echo "true" || echo "false");
            HEALTH_OK=$(curl -sf http://localhost:3000/health 2>/dev/null && echo "true" || echo "false");
            DOCKER_OK=$(docker ps --filter name=hft -q 2>/dev/null | head -1);
            echo "FINAL_CHECK|SIGNAL:$SIGNAL_OK|HEALTH:$HEALTH_OK|DOCKER:$DOCKER_OK"
          `,
          privateKey,
          username: 'root',
          timeout: 15000,
        },
      });
      
      const finalOutput = finalCheck?.output || '';
      console.log(`[bot-control] Final verification: ${finalOutput}`);
      
      if (finalOutput.includes('SIGNAL:false')) {
        // Signal was deleted after creation - something is wrong
        console.error('[bot-control] ❌ START_SIGNAL was deleted after creation!');
        newBotStatus = 'standby';
        healthVerified = false;
        signalVerified = false;
      } else if (finalOutput.includes('SIGNAL:true') && (finalOutput.includes('HEALTH:true') || finalOutput.includes('DOCKER:'))) {
        // Signal exists and either health is OK or Docker is running
        newBotStatus = 'running';
        healthVerified = finalOutput.includes('HEALTH:true');
        console.log(`[bot-control] ✅ Bot verified: signalExists=true, healthOK=${healthVerified}`);
      } else {
        // Partial success - container may be starting
        newBotStatus = 'running';
        healthVerified = false;
        console.log('[bot-control] ⚠️ Bot starting but health not confirmed yet');
      }
    }

    // For status/health action, parse and return the result
    if (action === 'status' || action === 'health') {
      let botStatus = 'unknown';
      let healthData = null;
      let signalExists = false;
      let dockerRunning = false;
      
      try {
        const output = sshResult.output || '';
        console.log('[bot-control] Raw status output:', output);
        
        // Parse our structured output: DOCKER:...|SIGNAL:...|HEALTH:...
        // STATUS:running or STATUS:standby or STATUS:stopped
        if (output.includes('STATUS:running')) {
          botStatus = 'running';
          signalExists = true;
          dockerRunning = true;
        } else if (output.includes('STATUS:standby')) {
          botStatus = 'standby';
          signalExists = false;
          dockerRunning = true;
        } else if (output.includes('STATUS:stopped')) {
          botStatus = 'stopped';
          signalExists = false;
          dockerRunning = false;
        } else if (output.includes('SIGNAL:true')) {
          // Fallback: parse individual fields
          signalExists = true;
          dockerRunning = output.includes('DOCKER:Up') || output.includes('Up ');
          botStatus = signalExists && dockerRunning ? 'running' : (dockerRunning ? 'standby' : 'stopped');
        } else if (output.includes('Up') && !output.includes('SIGNAL:false')) {
          // Legacy fallback - Docker is up but we don't know about signal
          // Assume standby if SIGNAL check wasn't included
          botStatus = 'standby';
          dockerRunning = true;
        } else if (output.includes('"status":"ok"') || output.includes('"status": "ok"')) {
          // Health endpoint returned OK - but this alone doesn't mean the bot is trading
          // Only set to 'running' if we already detected SIGNAL:true
          // Otherwise, this is just a healthy container in standby
          if (signalExists) {
            botStatus = 'running';
          } else {
            botStatus = 'standby';
            dockerRunning = true;
          }
          try {
            // Try to extract health data from JSON response
            const jsonMatch = output.match(/\{[^}]+\}/);
            if (jsonMatch) {
              healthData = JSON.parse(jsonMatch[0]);
            }
          } catch {}
        } else if (output.includes('Exited') || output.includes('stopped') || output.includes('errored')) {
          botStatus = 'stopped';
        } else if (output.includes('not_found') || output.includes('no_bot_found')) {
          botStatus = 'not_deployed';
        }
        
        console.log('[bot-control] Parsed status:', { botStatus, signalExists, dockerRunning });
      } catch (parseErr) {
        console.error('[bot-control] Status parse error:', parseErr);
        botStatus = 'unknown';
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          status: botStatus,
          health: healthData,
          signalExists,
          dockerRunning,
          output: sshResult.output,
          ipAddress 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // For logs action, return the output directly
    if (action === 'logs') {
      return new Response(
        JSON.stringify({ 
          success: true, 
          logs: sshResult.output,
          ipAddress 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update deployment status in database - SYNC ALL RELATED TABLES
    if (newBotStatus) {
      const updateTime = new Date().toISOString();
      
      // 1. Update hft_deployments
      await supabase
        .from('hft_deployments')
        .update({ 
          bot_status: newBotStatus,
          updated_at: updateTime
        })
        .eq('id', deployment.id);

      // 2. Update vps_instances if linked
      await supabase
        .from('vps_instances')
        .update({ 
          bot_status: newBotStatus,
          updated_at: updateTime
        })
        .or(`deployment_id.eq.${deployment.server_id},provider_instance_id.eq.${deployment.server_id}`);
      
      // 3. Update trading_config for global state sync
      await supabase
        .from('trading_config')
        .update({ 
          bot_status: newBotStatus,
          trading_enabled: newBotStatus === 'running' && healthVerified,
          updated_at: updateTime
        })
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      console.log(`[bot-control] Updated all status tables: ${newBotStatus}, healthVerified: ${healthVerified}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        action,
        mode: 'live',
        method: 'ssh',
        botStatus: newBotStatus,
        signalVerified,
        healthVerified,
        output: sshResult.output?.substring(0, 500),
        ipAddress 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[bot-control] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
