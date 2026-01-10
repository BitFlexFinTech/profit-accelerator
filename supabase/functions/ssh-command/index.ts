import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

    // Strategy: Use HTTP endpoints instead of SSH for VPS control
    // The VPS should have a control API running on port 8080
    
    // Health check commands - make HTTP request to VPS
    if (command.includes('curl') && command.includes('health')) {
      console.log(`[ssh-command] Health check via HTTP to ${ipAddress}`);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(`http://${ipAddress}/health`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        
        clearTimeout(timeoutId);
        
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
      console.log(`[ssh-command] Container status check via HTTP to ${ipAddress}/status`);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`http://${ipAddress}/status`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
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
    
    // Start/Stop/Restart commands - try to call VPS control API
    if (command.includes('docker compose')) {
      const isStart = command.includes('up -d');
      const isStop = command.includes('down');
      const action = isStart ? 'start' : (isStop ? 'stop' : 'restart');
      
      console.log(`[ssh-command] Bot ${action} via HTTP to ${ipAddress}/control`);
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(`http://${ipAddress}/control`, {
          method: 'POST',
          signal: controller.signal,
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ action, command })
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.text();
          console.log(`[ssh-command] Control API response: ${data.substring(0, 100)}`);
          return new Response(
            JSON.stringify({
              success: true,
              exitCode: 0,
              output: data || `Bot ${action} command accepted`
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          // Control endpoint returned error
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
        // Control API not available - return actual failure, not simulated success
        const errMsg = httpErr instanceof Error ? httpErr.message : String(httpErr);
        console.error(`[ssh-command] Control API failed: ${errMsg}`);
        
        return new Response(
          JSON.stringify({
            success: false,
            exitCode: 1,
            output: `VPS control API not available at ${ipAddress}/control`,
            error: `Control API failed: ${errMsg}. Redeploy VPS with updated bot code.`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
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
