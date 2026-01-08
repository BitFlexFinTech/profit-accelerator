import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { action, fromDeploymentId, toDeploymentId } = await req.json();
    console.log(`[migrate-vps] Action: ${action}`);

    switch (action) {
      case 'prepare-migration': {
        // Check both VPS are healthy
        const { data: deployments } = await supabase
          .from('hft_deployments')
          .select('*')
          .in('id', [fromDeploymentId, toDeploymentId]);

        if (!deployments || deployments.length !== 2) {
          throw new Error('Could not find both VPS deployments');
        }

        const fromVPS = deployments.find(d => d.id === fromDeploymentId);
        const toVPS = deployments.find(d => d.id === toDeploymentId);

        if (!toVPS?.ip_address) {
          throw new Error('Target VPS has no IP address');
        }

        // Check target VPS health
        const { data: healthResult } = await supabase.functions.invoke('bot-control', {
          body: { action: 'health', deploymentId: toDeploymentId }
        });

        return new Response(JSON.stringify({
          success: true,
          fromVPS: {
            id: fromVPS?.id,
            provider: fromVPS?.provider,
            ip: fromVPS?.ip_address,
            botStatus: fromVPS?.bot_status
          },
          toVPS: {
            id: toVPS.id,
            provider: toVPS.provider,
            ip: toVPS.ip_address,
            botStatus: toVPS.bot_status,
            health: healthResult
          }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'execute-migration': {
        // Step 1: Stop bot on source VPS gracefully
        console.log('[migrate-vps] Stopping bot on source VPS...');
        await supabase.functions.invoke('bot-control', {
          body: { action: 'stop', deploymentId: fromDeploymentId }
        });

        // Wait for graceful shutdown
        await new Promise(r => setTimeout(r, 5000));

        // Step 2: Start bot on target VPS
        console.log('[migrate-vps] Starting bot on target VPS...');
        const { error: startError } = await supabase.functions.invoke('bot-control', {
          body: { action: 'start', deploymentId: toDeploymentId }
        });

        if (startError) {
          throw new Error(`Failed to start bot on target: ${startError.message}`);
        }

        // Step 3: Update failover_config
        console.log('[migrate-vps] Updating failover configuration...');
        
        // Get target deployment info
        const { data: targetDeploy } = await supabase
          .from('hft_deployments')
          .select('provider, region, ip_address')
          .eq('id', toDeploymentId)
          .single();

        if (targetDeploy) {
          // Clear all primary flags
          await supabase
            .from('failover_config')
            .update({ is_primary: false })
            .neq('id', '00000000-0000-0000-0000-000000000000');

          // Set new primary
          await supabase
            .from('failover_config')
            .upsert({
              provider: targetDeploy.provider,
              region: targetDeploy.region,
              is_primary: true,
              is_enabled: true,
              priority: 1,
            }, { onConflict: 'provider' });

          // Update vps_config with new IP
          if (targetDeploy.ip_address) {
            await supabase
              .from('vps_config')
              .update({ outbound_ip: targetDeploy.ip_address })
              .eq('provider', targetDeploy.provider);
          }
        }

        // Step 4: Trigger IP whitelist sync
        console.log('[migrate-vps] Syncing IP whitelist...');
        await supabase.functions.invoke('sync-ip-whitelist', {
          body: { newIP: targetDeploy?.ip_address }
        }).catch(() => {});

        return new Response(JSON.stringify({
          success: true,
          message: 'Migration completed successfully',
          newPrimary: {
            id: toDeploymentId,
            provider: targetDeploy?.provider,
            ip: targetDeploy?.ip_address
          }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'rollback-migration': {
        // Rollback by restarting on original VPS
        console.log('[migrate-vps] Rolling back migration...');
        
        await supabase.functions.invoke('bot-control', {
          body: { action: 'stop', deploymentId: toDeploymentId }
        });

        await new Promise(r => setTimeout(r, 3000));

        await supabase.functions.invoke('bot-control', {
          body: { action: 'start', deploymentId: fromDeploymentId }
        });

        // Restore failover config
        const { data: sourceDeploy } = await supabase
          .from('hft_deployments')
          .select('provider, region')
          .eq('id', fromDeploymentId)
          .single();

        if (sourceDeploy) {
          await supabase
            .from('failover_config')
            .update({ is_primary: false })
            .neq('id', '00000000-0000-0000-0000-000000000000');

          await supabase
            .from('failover_config')
            .upsert({
              provider: sourceDeploy.provider,
              region: sourceDeploy.region,
              is_primary: true,
              is_enabled: true,
            }, { onConflict: 'provider' });
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Rollback completed'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[migrate-vps] Error:', error);
    
    return new Response(JSON.stringify({ success: false, error }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});