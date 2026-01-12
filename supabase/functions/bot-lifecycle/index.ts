import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Bot Lifecycle Edge Function
 * 
 * Pure bot lifecycle management - start/stop/restart/status
 * Does NOT attempt any trades - that's separate functionality
 * 
 * Actions:
 * - start: Start bot container, create START_SIGNAL, update DB
 * - stop: Stop bot container, remove START_SIGNAL, update DB
 * - restart: Restart bot container
 * - status: Get current bot status from VPS and DB
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const result = {
    success: false,
    action: '',
    botStatus: 'unknown' as 'running' | 'stopped' | 'starting' | 'error' | 'unknown',
    vpsReachable: false,
    vpsIp: null as string | null,
    message: '',
    timestamp: new Date().toISOString()
  };

  try {
    const body = await req.json();
    const action = body.action || 'status';
    result.action = action;
    
    console.log(`[bot-lifecycle] Action: ${action}`);

    // Step 1: Get VPS deployment
    const { data: deployment } = await supabase
      .from('hft_deployments')
      .select('id, ip_address, bot_status, provider, server_id')
      .in('status', ['active', 'running'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (!deployment?.ip_address) {
      result.message = 'No active VPS deployment found';
      console.log('[bot-lifecycle] No VPS found');
      return new Response(JSON.stringify(result), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    result.vpsIp = deployment.ip_address;
    console.log(`[bot-lifecycle] VPS: ${deployment.ip_address}`);

    // Step 2: Check VPS reachability
    try {
      const healthResp = await fetch(`http://${deployment.ip_address}/health`, {
        signal: AbortSignal.timeout(5000)
      });
      result.vpsReachable = healthResp.ok;
    } catch {
      result.vpsReachable = false;
    }

    if (!result.vpsReachable) {
      result.message = 'VPS is not reachable';
      result.botStatus = 'error';
      console.log('[bot-lifecycle] VPS unreachable');
      return new Response(JSON.stringify(result), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const now = new Date().toISOString();

    // Handle actions
    switch (action) {
      case 'start': {
        console.log('[bot-lifecycle] Starting bot...');
        
        // Try HTTP /control endpoint first
        try {
          const controlResp = await fetch(`http://${deployment.ip_address}/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start', createSignal: true }),
            signal: AbortSignal.timeout(10000)
          });

          if (controlResp.ok) {
            const controlData = await controlResp.json();
            console.log('[bot-lifecycle] VPS /control response:', controlData);

            if (controlData.success || controlData.signalCreated) {
              // Update database
              await supabase.from('hft_deployments')
                .update({ bot_status: 'running', updated_at: now })
                .eq('id', deployment.id);

              await supabase.from('trading_config')
                .update({ bot_status: 'running', trading_enabled: true, updated_at: now })
                .neq('id', '00000000-0000-0000-0000-000000000000');

              result.success = true;
              result.botStatus = 'running';
              result.message = 'Bot started successfully';
              
              console.log('[bot-lifecycle] ✅ Bot started via HTTP');
            } else {
              result.message = controlData.error || 'VPS did not confirm start';
              result.botStatus = 'error';
            }
          }
        } catch (httpErr) {
          console.log('[bot-lifecycle] HTTP control failed, will use bot-control fallback');
          
          // Fallback to bot-control function (which uses SSH)
          const { data: sshResult, error: sshErr } = await supabase.functions.invoke('bot-control', {
            body: { action: 'start', deploymentId: deployment.id }
          });

          if (sshErr || !sshResult?.success) {
            result.message = sshErr?.message || sshResult?.error || 'Failed to start bot';
            result.botStatus = 'error';
          } else {
            result.success = true;
            result.botStatus = 'running';
            result.message = 'Bot started successfully (via SSH)';
          }
        }
        break;
      }

      case 'stop': {
        console.log('[bot-lifecycle] Stopping bot...');
        
        try {
          const controlResp = await fetch(`http://${deployment.ip_address}/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'stop' }),
            signal: AbortSignal.timeout(10000)
          });

          if (controlResp.ok) {
            // Update database
            await supabase.from('hft_deployments')
              .update({ bot_status: 'stopped', updated_at: now })
              .eq('id', deployment.id);

            await supabase.from('trading_config')
              .update({ bot_status: 'stopped', trading_enabled: false, updated_at: now })
              .neq('id', '00000000-0000-0000-0000-000000000000');

            result.success = true;
            result.botStatus = 'stopped';
            result.message = 'Bot stopped successfully';
            
            console.log('[bot-lifecycle] ✅ Bot stopped via HTTP');
          }
        } catch {
          // Fallback to bot-control
          const { data: sshResult, error: sshErr } = await supabase.functions.invoke('bot-control', {
            body: { action: 'stop', deploymentId: deployment.id }
          });

          if (sshErr || !sshResult?.success) {
            result.message = sshErr?.message || sshResult?.error || 'Failed to stop bot';
            result.botStatus = 'error';
          } else {
            result.success = true;
            result.botStatus = 'stopped';
            result.message = 'Bot stopped successfully (via SSH)';
          }
        }
        break;
      }

      case 'restart': {
        console.log('[bot-lifecycle] Restarting bot...');
        
        try {
          const controlResp = await fetch(`http://${deployment.ip_address}/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'restart', createSignal: true }),
            signal: AbortSignal.timeout(15000)
          });

          if (controlResp.ok) {
            await supabase.from('hft_deployments')
              .update({ bot_status: 'running', updated_at: now })
              .eq('id', deployment.id);

            await supabase.from('trading_config')
              .update({ bot_status: 'running', trading_enabled: true, updated_at: now })
              .neq('id', '00000000-0000-0000-0000-000000000000');

            result.success = true;
            result.botStatus = 'running';
            result.message = 'Bot restarted successfully';
          }
        } catch {
          const { data: sshResult, error: sshErr } = await supabase.functions.invoke('bot-control', {
            body: { action: 'restart', deploymentId: deployment.id }
          });

          if (sshErr || !sshResult?.success) {
            result.message = sshErr?.message || sshResult?.error || 'Failed to restart bot';
            result.botStatus = 'error';
          } else {
            result.success = true;
            result.botStatus = 'running';
            result.message = 'Bot restarted successfully (via SSH)';
          }
        }
        break;
      }

      case 'status':
      default: {
        // Get status from VPS
        try {
          const statusResp = await fetch(`http://${deployment.ip_address}/status`, {
            signal: AbortSignal.timeout(5000)
          });

          if (statusResp.ok) {
            const statusData = await statusResp.json();
            result.botStatus = statusData.botActive ? 'running' : 'stopped';
            result.success = true;
            result.message = statusData.botActive ? 'Bot is running' : 'Bot is stopped';
          } else {
            // Fallback to signal-check
            const signalResp = await fetch(`http://${deployment.ip_address}/signal-check`, {
              signal: AbortSignal.timeout(5000)
            });
            
            if (signalResp.ok) {
              const signalData = await signalResp.json();
              result.botStatus = signalData.signalExists ? 'running' : 'stopped';
              result.success = true;
            } else {
              result.botStatus = deployment.bot_status || 'unknown';
              result.success = true;
            }
          }
        } catch {
          result.botStatus = deployment.bot_status || 'unknown';
          result.message = 'Could not get live status, using cached';
          result.success = true;
        }
        break;
      }
    }

    console.log(`[bot-lifecycle] Result: ${result.success ? '✅' : '❌'} ${result.botStatus} - ${result.message}`);
    return new Response(JSON.stringify(result), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    result.message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[bot-lifecycle] Error:', result.message);
    return new Response(JSON.stringify(result), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
