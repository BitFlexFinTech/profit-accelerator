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

    // Fetch exchange credentials for start action
    let exchangeEnvVars = '';
    if (action === 'start') {
      const { data: exchanges } = await supabase
        .from('exchange_connections')
        .select('exchange_name, api_key, api_secret, api_passphrase')
        .eq('is_connected', true);
      
      if (exchanges?.length) {
        for (const ex of exchanges) {
          const name = ex.exchange_name.toUpperCase();
          if (ex.api_key) exchangeEnvVars += `export ${name}_API_KEY='${ex.api_key}' && `;
          if (ex.api_secret) exchangeEnvVars += `export ${name}_API_SECRET='${ex.api_secret}' && `;
          if (ex.api_passphrase) exchangeEnvVars += `export ${name}_PASSPHRASE='${ex.api_passphrase}' && `;
        }
        console.log(`[bot-control] Prepared credentials for ${exchanges.length} exchanges`);
      }
    }

    // Execute SSH command based on action
    let command = '';
    let newBotStatus = '';

    // Build .env.exchanges content for Docker
    let envFileContent = '';
    if (action === 'start' || action === 'restart') {
      const { data: exchanges } = await supabase
        .from('exchange_connections')
        .select('exchange_name, api_key, api_secret, api_passphrase')
        .eq('is_connected', true);
      
      if (exchanges?.length) {
        const envLines: string[] = ['STRATEGY_ENABLED=true', 'TRADE_MODE=SPOT'];
        for (const ex of exchanges) {
          const name = ex.exchange_name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
          if (ex.api_key) envLines.push(`${name}_API_KEY=${ex.api_key}`);
          if (ex.api_secret) envLines.push(`${name}_API_SECRET=${ex.api_secret}`);
          if (ex.api_passphrase) envLines.push(`${name}_PASSPHRASE=${ex.api_passphrase}`);
        }
        envFileContent = envLines.join('\\n');
        console.log(`[bot-control] Prepared .env.exchanges for ${exchanges.length} exchanges`);
      }
    }

    switch (action) {
      case 'start':
        // Write .env.exchanges file, then start Docker with it
        command = `mkdir -p /opt/hft-bot/app/data && touch /opt/hft-bot/app/data/START_SIGNAL && echo -e "${envFileContent}" > /opt/hft-bot/.env.exchanges && cd /opt/hft-bot && docker compose --env-file .env.exchanges down 2>/dev/null; docker compose --env-file .env.exchanges up -d --remove-orphans`;
        newBotStatus = 'running';
        break;
      case 'stop':
        // Remove start signal file, stop strategy
        command = `rm -f /opt/hft-bot/app/data/START_SIGNAL && cd /opt/hft-bot && export STRATEGY_ENABLED=false && docker compose down 2>/dev/null || docker stop hft-bot 2>/dev/null || echo "stopped"`;
        newBotStatus = 'stopped';
        break;
      case 'restart':
        // Restart with credentials from .env.exchanges
        command = `echo -e "${envFileContent}" > /opt/hft-bot/.env.exchanges && cd /opt/hft-bot && docker compose --env-file .env.exchanges down 2>/dev/null; docker compose --env-file .env.exchanges up -d --remove-orphans`;
        newBotStatus = 'running';
        break;
      case 'status':
        command = 'curl -s http://localhost:8080/health 2>/dev/null || docker ps --filter name=hft-bot --format "{{.Status}}" 2>/dev/null || pm2 jlist 2>/dev/null || echo "not_found"';
        break;
      case 'logs':
        command = 'docker compose -f /opt/hft-bot/docker-compose.yml logs --tail=50 2>/dev/null || docker logs hft-bot --tail=50 2>/dev/null || pm2 logs trading-bot --lines 50 --nostream 2>/dev/null || echo "no_logs"';
        break;
      case 'health':
        command = 'curl -s http://localhost:8080/health';
        break;
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Execute SSH command
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
      console.error('SSH command error:', sshError);
      return new Response(
        JSON.stringify({ success: false, error: `SSH error: ${sshError.message}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For status/health action, parse and return the result
    if (action === 'status' || action === 'health') {
      let botStatus = 'unknown';
      let healthData = null;
      
      try {
        const output = sshResult.output || '';
        
        // Try to parse health endpoint JSON response
        if (output.includes('"status":"ok"') || output.includes('"status": "ok"')) {
          botStatus = 'running';
          try {
            healthData = JSON.parse(output.trim());
          } catch {}
        } else if (output.includes('Up') || output.includes('running')) {
          botStatus = 'running';
        } else if (output.includes('online')) {
          botStatus = 'running';
        } else if (output.includes('Exited') || output.includes('stopped') || output.includes('errored')) {
          botStatus = 'stopped';
        } else if (output.includes('not_found') || output.includes('no_bot_found')) {
          botStatus = 'not_deployed';
        }
      } catch {
        botStatus = 'unknown';
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          status: botStatus,
          health: healthData,
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
          trading_enabled: newBotStatus === 'running',
          updated_at: updateTime
        })
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      console.log(`[bot-control] Synced bot_status=${newBotStatus} across all tables`);
    }

    console.log(`[bot-control] ${action} completed successfully for ${ipAddress}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        action,
        botStatus: newBotStatus || 'unknown',
        output: sshResult.output,
        ipAddress
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[bot-control] Error:', error);
    
    return new Response(
      JSON.stringify({ success: false, error }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
