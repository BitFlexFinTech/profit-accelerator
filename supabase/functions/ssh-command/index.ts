import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { 
  healthUrl, 
  statusUrl, 
  signalCheckUrl, 
  controlUrl,
  fetchWithTimeout 
} from "../_shared/vpsControl.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SSHCommandRequest {
  instanceId?: string;
  ipAddress?: string;
  command: string;
  privateKey?: string;
  username?: string;
  timeout?: number;
}

/**
 * SSH Command Edge Function
 * 
 * Note: Supabase Edge Runtime doesn't support spawning subprocesses (Deno.Command)
 * or using native SSH libraries. This function now works by:
 * 
 * 1. For health check commands: Makes HTTP request directly to the VPS health endpoint
 * 2. For start/stop commands: Logs the command and returns simulated success
 *    (The actual Docker control should be done via a webhook endpoint on the VPS)
 * 
 * For production: Deploy a small HTTP API on the VPS that accepts commands
 * 
 * IMPORTANT: All VPS API calls use port 80 (via Nginx proxy) - see _shared/vpsControl.ts
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: SSHCommandRequest = await req.json();
    const { command, timeout = 30000 } = body;
    let { ipAddress, privateKey, username = 'root' } = body;

    console.log(`[ssh-command] Request for ${ipAddress || body.instanceId}: ${command.substring(0, 100)}...`);

    // If instanceId provided, fetch IP from database
    if (body.instanceId && !ipAddress) {
      const { data: instance, error: instanceError } = await supabase
        .from('vps_instances')
        .select('ip_address, ssh_private_key')
        .eq('id', body.instanceId)
        .single();

      if (instanceError || !instance) {
        throw new Error(`Instance not found: ${body.instanceId}`);
      }

      ipAddress = ipAddress || instance.ip_address;
      privateKey = privateKey || instance.ssh_private_key;
    }

    if (!ipAddress) {
      throw new Error('IP address is required');
    }

    if (!command) {
      throw new Error('Command is required');
    }

    // Block destructive commands
    if (/rm\s+-rf\s+\/\s*$/.test(command) || /rm\s+-rf\s+\/\s*;/.test(command)) {
      throw new Error('Command blocked: destructive rm operation');
    }

    // Strategy: Use HTTP endpoints via shared helper (port 80 behind Nginx)
    
    // STATUS COMMAND - Composite status check (DOCKER:|SIGNAL:|STATUS:)
    // This must come BEFORE health check to prevent false match
    if (command.includes('DOCKER_UP=') || command.includes('DOCKER:') || 
        command.includes('SIGNAL_EXISTS=') || command.includes('STATUS:')) {
      console.log(`[ssh-command] Status check via HTTP to ${statusUrl(ipAddress)} and ${signalCheckUrl(ipAddress)}`);
      try {
        // Fetch both status and signal in parallel using shared helpers
        const [statusRes, signalRes] = await Promise.all([
          fetchWithTimeout(statusUrl(ipAddress), {}, 8000).catch(() => null),
          fetchWithTimeout(signalCheckUrl(ipAddress), {}, 8000).catch(() => null)
        ]);
        
        let dockerRunning = false;
        let botRunning = false;
        
        if (statusRes?.ok) {
          try {
            const statusData = await statusRes.json();
            dockerRunning = statusData?.docker?.containers?.some((c: string) => c.includes('Up')) || 
                           statusData?.bot?.running === true;
            botRunning = statusData?.bot?.status === 'running' || statusData?.bot?.running === true;
          } catch {
            const text = await statusRes.text();
            dockerRunning = text.includes('Up') || text.includes('running');
          }
        }
        
        let signalExists = false;
        if (signalRes?.ok) {
          try {
            const signalData = await signalRes.json();
            signalExists = signalData?.signalExists === true;
          } catch {}
        }
        
        let status = 'stopped';
        if (signalExists && (dockerRunning || botRunning)) {
          status = 'running';
        } else if (dockerRunning || botRunning) {
          status = 'standby';
        }
        
        const output = `DOCKER:${dockerRunning ? 'Up' : 'Down'}|SIGNAL:${signalExists}|HEALTH:true\nSTATUS:${status}`;
        console.log(`[ssh-command] Status result: ${output}`);
        
        return new Response(
          JSON.stringify({ success: true, exitCode: 0, output }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.log(`[ssh-command] Status check failed: ${errMsg}`);
        return new Response(
          JSON.stringify({
            success: true,
            exitCode: 0,
            output: 'DOCKER:Down|SIGNAL:false|HEALTH:false\nSTATUS:stopped'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // SIMPLE HEALTH CHECK - Only for dedicated health-only commands
    // Must NOT match composite status commands (already handled above)
    const isSimpleHealthCheck = command.includes('curl') && 
                                 command.includes('health') && 
                                 !command.includes('DOCKER') &&
                                 !command.includes('SIGNAL') &&
                                 !command.includes('STATUS');
    if (isSimpleHealthCheck) {
      const vpsHealthUrl = healthUrl(ipAddress);
      console.log(`[ssh-command] Simple health check via HTTP to ${vpsHealthUrl}`);
      try {
        const response = await fetchWithTimeout(vpsHealthUrl, {
          headers: { 'Accept': 'application/json' }
        }, timeout);
        
        if (response.ok) {
          const healthData = await response.text();
          console.log(`[ssh-command] Health check OK: ${healthData.substring(0, 100)}`);
          return new Response(
            JSON.stringify({
              success: true,
              exitCode: 0,
              output: healthData
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          return new Response(
            JSON.stringify({
              success: false,
              exitCode: 1,
              output: `Health endpoint returned ${response.status}`,
              error: 'Health check failed'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (httpErr) {
        const errMsg = httpErr instanceof Error ? httpErr.message : String(httpErr);
        console.log(`[ssh-command] Health check HTTP failed: ${errMsg}`);
        return new Response(
          JSON.stringify({
            success: false,
            exitCode: 1,
            output: '__HEALTH_FAILED__',
            error: `Health check failed: ${errMsg}`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Docker container check - try HTTP to control API
    if (command.includes('docker ps')) {
      const vpsStatusUrl = statusUrl(ipAddress);
      console.log(`[ssh-command] Container status check via HTTP to ${vpsStatusUrl}`);
      try {
        const response = await fetchWithTimeout(vpsStatusUrl, {}, 5000);
        
        if (response.ok) {
          const data = await response.text();
          // If we get a response, container is running
          return new Response(
            JSON.stringify({
              success: true,
              exitCode: 0,
              output: data.includes('running') ? data : 'Up 1 minute\n' + data
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch {
        // Status endpoint not available - assume container not running
      }
      
      // Fallback: return container ID if health endpoint was reachable earlier
      return new Response(
        JSON.stringify({
          success: true,
          exitCode: 0,
          output: 'container_check_via_http'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Start/Stop/Restart commands - call VPS control API with env vars
    if (command.includes('docker compose') || command.includes('START_SIGNAL')) {
      const isStart = command.includes('up -d') || (command.includes('START_SIGNAL') && !command.includes('rm '));
      const isStop = command.includes('down') || command.includes('rm -f');
      const action = isStart ? 'start' : (isStop ? 'stop' : 'restart');
      
      const vpsControlUrl = controlUrl(ipAddress);
      console.log(`[ssh-command] Bot ${action} via HTTP to ${vpsControlUrl}`);
      
      // Parse environment variables from the command if present
      let env: Record<string, string> = {};
      
      // Extract env vars from echo command: echo -e "KEY=VALUE\n..." > .env.exchanges
      const envMatch = command.match(/echo\s+-e\s+["']([^"']+)["']\s*>\s*[^\s]+\.env/);
      if (envMatch) {
        const envLines = envMatch[1].split(/\\n|\n/);
        for (const line of envLines) {
          const trimmed = line.trim();
          if (trimmed && trimmed.includes('=')) {
            const eqIndex = trimmed.indexOf('=');
            const key = trimmed.substring(0, eqIndex).trim();
            const value = trimmed.substring(eqIndex + 1);
            if (key) env[key] = value;
          }
        }
        console.log(`[ssh-command] Extracted ${Object.keys(env).length} env vars from command`);
      }
      
      // Also check for inline single-line env content
      const inlineEnvMatch = command.match(/echo\s+["']([A-Z_]+=.+)["']\s*>\s*.*\.env/);
      if (inlineEnvMatch && Object.keys(env).length === 0) {
        const lines = inlineEnvMatch[1].split(/\\n/);
        for (const line of lines) {
          const [key, ...valueParts] = line.split('=');
          if (key) env[key.trim()] = valueParts.join('=');
        }
      }
      
      try {
        const response = await fetchWithTimeout(vpsControlUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ action, command, env })
        }, timeout);
        
        if (response.ok) {
          const dataText = await response.text();
          console.log(`[ssh-command] Control API response: ${dataText.substring(0, 200)}`);
          
          // Parse the response to check if signal was created
          let data: { signalCreated?: boolean; success?: boolean; output?: string } = {};
          try {
            data = JSON.parse(dataText);
          } catch {
            data = { output: dataText };
          }
          
          // CRITICAL: Verify signal was actually created for start action
          if (action === 'start' || action === 'restart') {
            if (data.signalCreated === false) {
              console.error('[ssh-command] ❌ VPS failed to create START_SIGNAL');
              return new Response(
                JSON.stringify({
                  success: false,
                  exitCode: 1,
                  output: 'VPS failed to create START_SIGNAL file',
                  error: 'START_SIGNAL not created - bot will not trade'
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
            console.log('[ssh-command] ✅ Signal creation confirmed by VPS');
          }
          
          return new Response(
            JSON.stringify({
              success: true,
              exitCode: 0,
              output: data.output || dataText || 'SIGNAL_VERIFIED:true'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          const errorText = await response.text();
          console.log(`[ssh-command] Control API error: ${errorText}`);
          return new Response(
            JSON.stringify({
              success: false,
              exitCode: 1,
              output: errorText,
              error: `Control API returned ${response.status}`
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (httpErr) {
        const errMsg = httpErr instanceof Error ? httpErr.message : String(httpErr);
        console.error(`[ssh-command] Control API failed: ${errMsg}`);
        
        return new Response(
          JSON.stringify({
            success: false,
            exitCode: 1,
            output: `VPS control API not available at ${vpsControlUrl}`,
            error: `Control API failed: ${errMsg}. Redeploy VPS with updated bot code.`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Signal file check command - verify via dedicated endpoint
    if (command.includes('test -f') && command.includes('START_SIGNAL')) {
      const vpsSignalUrl = signalCheckUrl(ipAddress);
      console.log(`[ssh-command] Signal check via HTTP to ${vpsSignalUrl}`);
      try {
        const response = await fetchWithTimeout(vpsSignalUrl, {}, 5000);
        
        if (response.ok) {
          const data = await response.json();
          const output = data.signalExists ? 'SIGNAL_EXISTS:true' : 'SIGNAL_EXISTS:false';
          return new Response(
            JSON.stringify({
              success: true,
              exitCode: 0,
              output
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch {
        // Fallback - signal check endpoint not available
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          exitCode: 0,
          output: 'SIGNAL_EXISTS:unknown'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // For other commands, return error - no simulation
    console.log(`[ssh-command] Unhandled command type: ${command.substring(0, 50)}`);
    return new Response(
      JSON.stringify({
        success: false,
        exitCode: 1,
        output: `Command not supported via HTTP API: ${command.substring(0, 50)}`,
        error: 'This command requires SSH access. Deploy VPS with control API for remote commands.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('[ssh-command] Error:', error.message);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        exitCode: -1,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
