import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[scheduled-vps-health] Starting health check cycle...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all active VPS instances with IPs
    const { data: vpsInstances, error: vpsError } = await supabase
      .from('vps_config')
      .select('id, provider, region, outbound_ip, status, instance_type')
      .not('outbound_ip', 'is', null)
      .in('status', ['running', 'provisioning', 'healthy']);

    if (vpsError) {
      throw new Error(`Failed to fetch VPS instances: ${vpsError.message}`);
    }

    if (!vpsInstances?.length) {
      console.log('[scheduled-vps-health] No active VPS instances found');
      return new Response(
        JSON.stringify({ success: true, message: 'No active VPS instances', checked: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[scheduled-vps-health] Checking ${vpsInstances.length} VPS instances`);

    const results: { provider: string; status: string; latency: number; cpu?: number; memory?: number }[] = [];

    for (const vps of vpsInstances) {
      const provider = vps.provider || 'unknown';
      const ip = vps.outbound_ip;
      
      if (!ip || ip === 'Provisioning...' || ip === 'Manual Setup Required') {
        console.log(`[scheduled-vps-health] Skipping ${provider}: no valid IP (${ip})`);
        continue;
      }

      let healthStatus = 'offline';
      let latencyMs = 9999;
      let cpuPercent = 0;
      let ramPercent = 0;
      let diskPercent = 0;

      try {
        // Try to ping the health endpoint
        const healthUrl = `http://${ip}:8080/health`;
        console.log(`[scheduled-vps-health] Pinging ${provider} at ${healthUrl}`);
        
        const pingStart = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(healthUrl, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        
        clearTimeout(timeoutId);
        latencyMs = Date.now() - pingStart;

        if (response.ok) {
          healthStatus = 'healthy';
          
          try {
            const health = await response.json();
            cpuPercent = health.cpu || health.cpuPercent || 0;
            ramPercent = health.memory || health.memoryPercent || health.ram || 0;
            diskPercent = health.disk || health.diskPercent || 0;
          } catch {
            // Response wasn't JSON, but VPS is reachable
            healthStatus = 'healthy';
          }
        } else {
          healthStatus = 'warning';
        }
      } catch (fetchErr) {
        if (fetchErr instanceof Error) {
          if (fetchErr.name === 'AbortError') {
            console.log(`[scheduled-vps-health] ${provider} timed out`);
            healthStatus = 'timeout';
          } else {
            console.log(`[scheduled-vps-health] ${provider} unreachable: ${fetchErr.message}`);
            healthStatus = 'offline';
          }
        }
      }

      // Insert metrics into vps_metrics
      const { error: insertError } = await supabase.from('vps_metrics').insert({
        provider,
        cpu_percent: cpuPercent,
        ram_percent: ramPercent,
        disk_percent: diskPercent,
        latency_ms: latencyMs,
        recorded_at: new Date().toISOString()
      });

      if (insertError) {
        console.error(`[scheduled-vps-health] Failed to insert metrics for ${provider}:`, insertError.message);
      }

      // Update vps_config status if changed
      const newStatus = healthStatus === 'healthy' ? 'running' : 
                        healthStatus === 'warning' ? 'warning' : 
                        healthStatus === 'timeout' ? 'timeout' : 'offline';

      if (vps.status !== newStatus) {
        await supabase
          .from('vps_config')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', vps.id);

        // Log status change
        if (healthStatus === 'offline' || healthStatus === 'timeout') {
          await supabase.from('vps_timeline_events').insert({
            provider,
            event_type: 'health_check',
            event_subtype: 'status_change',
            title: `${provider} VPS ${healthStatus}`,
            description: `VPS at ${ip} is ${healthStatus}. Latency: ${latencyMs}ms`,
            metadata: { ip, latencyMs, previousStatus: vps.status, newStatus }
          });
        }
      }

      results.push({
        provider,
        status: healthStatus,
        latency: latencyMs,
        cpu: cpuPercent,
        memory: ramPercent
      });

      console.log(`[scheduled-vps-health] ${provider}: ${healthStatus} (${latencyMs}ms, CPU: ${cpuPercent}%, RAM: ${ramPercent}%)`);
    }

    const duration = Date.now() - startTime;
    console.log(`[scheduled-vps-health] Completed in ${duration}ms, checked ${results.length} instances`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        checked: results.length,
        duration,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[scheduled-vps-health] Error:', message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});