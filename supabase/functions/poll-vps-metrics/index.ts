import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HealthResponse {
  status: string;
  uptime?: number;
  memory?: { percent: number; total?: number; used?: number };
  cpu?: number[] | number;
  disk?: number;
  network?: { in_mbps?: number; out_mbps?: number };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('Starting VPS metrics polling...');

    // Fetch all running instances with IP addresses
    const { data: instances, error: instancesError } = await supabase
      .from('vps_instances')
      .select('id, provider, ip_address, provider_instance_id')
      .eq('status', 'running')
      .not('ip_address', 'is', null);

    if (instancesError) {
      throw new Error(`Failed to fetch instances: ${instancesError.message}`);
    }

    if (!instances || instances.length === 0) {
      console.log('No running instances to poll');
      return new Response(
        JSON.stringify({ success: true, message: 'No running instances', polled: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Polling ${instances.length} instances...`);

    const results: Array<{ provider: string; success: boolean; error?: string }> = [];

    // Poll each instance in parallel
    await Promise.all(
      instances.map(async (instance) => {
        const startTime = Date.now();
        
        try {
          // Try to fetch health endpoint from the VPS
          const healthUrl = `http://${instance.ip_address}/health`;
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

          const response = await fetch(healthUrl, {
            method: 'GET',
            signal: controller.signal,
            headers: { 'Accept': 'application/json' },
          });

          clearTimeout(timeoutId);

          const latencyMs = Date.now() - startTime;

          if (!response.ok) {
            throw new Error(`Health endpoint returned ${response.status}`);
          }

          const health: HealthResponse = await response.json();

          // Parse metrics from health response
          const cpuPercent = Array.isArray(health.cpu) 
            ? (health.cpu[0] ?? 0) * 100 
            : (typeof health.cpu === 'number' ? health.cpu : 0);
          
          const ramPercent = health.memory?.percent ?? 0;
          const diskPercent = health.disk ?? 0;
          const uptimeSeconds = health.uptime ?? 0;
          const networkIn = health.network?.in_mbps ?? 0;
          const networkOut = health.network?.out_mbps ?? 0;

          // Upsert metrics into vps_metrics table
          const { error: upsertError } = await supabase
            .from('vps_metrics')
            .upsert({
              provider: instance.provider,
              cpu_percent: cpuPercent,
              ram_percent: ramPercent,
              disk_percent: diskPercent,
              latency_ms: latencyMs,
              uptime_seconds: uptimeSeconds,
              network_in_mbps: networkIn,
              network_out_mbps: networkOut,
              recorded_at: new Date().toISOString(),
            }, {
              onConflict: 'provider',
            });

          if (upsertError) {
            console.error(`Failed to upsert metrics for ${instance.provider}:`, upsertError);
          }

          // Update last_health_check in vps_instances
          await supabase
            .from('vps_instances')
            .update({ 
              last_health_check: new Date().toISOString(),
              uptime_seconds: uptimeSeconds,
            })
            .eq('id', instance.id);

          results.push({ provider: instance.provider, success: true });
          console.log(`Metrics collected for ${instance.provider}: CPU ${cpuPercent.toFixed(1)}%, RAM ${ramPercent.toFixed(1)}%, Latency ${latencyMs}ms`);

        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          
          // Record failed poll with just latency
          const latencyMs = Date.now() - startTime;
          
          await supabase
            .from('vps_metrics')
            .upsert({
              provider: instance.provider,
              latency_ms: latencyMs > 10000 ? null : latencyMs, // null if timeout
              recorded_at: new Date().toISOString(),
            }, {
              onConflict: 'provider',
            });

          results.push({ provider: instance.provider, success: false, error });
          console.warn(`Failed to poll ${instance.provider} (${instance.ip_address}): ${error}`);
        }
      })
    );

    const successCount = results.filter(r => r.success).length;
    console.log(`Polling complete: ${successCount}/${instances.length} successful`);

    return new Response(
      JSON.stringify({
        success: true,
        polled: instances.length,
        successful: successCount,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('Metrics polling error:', error.message);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
