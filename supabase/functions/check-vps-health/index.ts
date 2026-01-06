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

    // Get VPS config to find the IP
    const { data: vpsConfig, error: vpsError } = await supabase
      .from('vps_config')
      .select('outbound_ip, provider')
      .eq('provider', 'vultr')
      .single();

    if (vpsError || !vpsConfig?.outbound_ip) {
      console.error('[check-vps-health] No VPS config found:', vpsError);
      return new Response(
        JSON.stringify({ success: false, error: 'No VPS configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
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
          provider: vpsConfig.provider || 'vultr',
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
          .eq('provider', 'vultr');

        if (updateError) {
          console.error('[check-vps-health] Failed to update status:', updateError);
        }
      }
    } catch (fetchError) {
      console.error('[check-vps-health] Fetch failed:', fetchError);
      
      // Check current status - don't override if manually set to running
      const { data: currentStatus } = await supabase
        .from('vps_config')
        .select('status')
        .eq('provider', 'vultr')
        .single();
      
      // Only set to offline if not already manually set to running
      if (currentStatus?.status !== 'running') {
        await supabase
          .from('vps_config')
          .update({ status: 'offline', updated_at: new Date().toISOString() })
          .eq('provider', 'vultr');
      } else {
        console.log('[check-vps-health] VPS status is running, not overriding to offline');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        healthy: isHealthy,
        ip: vpsConfig.outbound_ip,
        data: healthData,
        latency_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[check-vps-health] Error:', errMessage);
    return new Response(
      JSON.stringify({ success: false, error: errMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});