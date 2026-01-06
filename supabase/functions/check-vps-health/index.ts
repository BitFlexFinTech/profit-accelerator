import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get VPS config - provider agnostic now
    const { data: vpsConfig, error: vpsError } = await supabase
      .from('vps_config')
      .select('id, outbound_ip, provider, status')
      .single();

    if (vpsError || !vpsConfig?.outbound_ip) {
      console.log('[check-vps-health] No VPS configured');
      // Return 200 with healthy: false instead of 404 to avoid frontend errors
      return new Response(
        JSON.stringify({ success: true, healthy: false, error: 'No VPS configured', ip: null, provider: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const healthUrl = `http://${vpsConfig.outbound_ip}:8080/health`;
    console.log(`[check-vps-health] Checking health at: ${healthUrl}`);

    const startTime = Date.now();
    let healthData: any = null;
    let isHealthy = false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        healthData = await response.json();
        isHealthy = healthData.status === 'ok';
        console.log('[check-vps-health] Health response:', healthData);

        // Insert metrics into vps_metrics
        const { error: metricsError } = await supabase.from('vps_metrics').insert({
          provider: vpsConfig.provider || 'unknown',
          cpu_percent: healthData.cpu_percent ?? healthData.cpu ?? 0,
          ram_percent: healthData.ram_percent ?? healthData.memory_percent ?? 0,
          disk_percent: healthData.disk_percent ?? 0,
          latency_ms: latencyMs,
          network_in_mbps: 0,
          network_out_mbps: 0,
          uptime_seconds: healthData.uptime_seconds ?? healthData.uptime ?? 0,
          recorded_at: new Date().toISOString(),
        });

        if (metricsError) {
          console.error('[check-vps-health] Failed to insert metrics:', metricsError);
        } else {
          console.log('[check-vps-health] Metrics inserted successfully');
        }

        // Update VPS status to running
        const { error: updateError } = await supabase
          .from('vps_config')
          .update({ status: 'running', updated_at: new Date().toISOString() })
          .eq('id', vpsConfig.id);

        if (updateError) {
          console.error('[check-vps-health] Failed to update status:', updateError);
        }
      }
    } catch (fetchError) {
      console.error('[check-vps-health] Fetch failed:', fetchError);
      
      // Set status to offline since health check failed
      await supabase
        .from('vps_config')
        .update({ status: 'offline', updated_at: new Date().toISOString() })
        .not('status', 'eq', 'deploying'); // Don't override deploying status
    }

    return new Response(
      JSON.stringify({
        success: true,
        healthy: isHealthy,
        ip: vpsConfig.outbound_ip,
        provider: vpsConfig.provider,
        data: healthData,
        latency_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[check-vps-health] Error:', errMessage);
    return new Response(
      JSON.stringify({ success: false, error: errMessage, healthy: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
