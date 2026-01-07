import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StatusResponse {
  status: 'running' | 'initializing' | 'stopped' | 'unknown';
  latency_ms: number;
  cpu_percent?: number;
  memory_percent?: number;
  uptime_seconds?: number;
  provider: string;
  checked_at: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider, ip } = await req.json();

    if (!provider || !ip) {
      return new Response(
        JSON.stringify({ error: 'Provider and IP required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[VPSStatusPoll] Checking ${provider} at ${ip}`);

    const startTime = Date.now();
    let result: StatusResponse = {
      status: 'unknown',
      latency_ms: 0,
      provider,
      checked_at: new Date().toISOString(),
    };

    // Try to check VPS health via HTTP ping to the HFT bot endpoint
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const healthResponse = await fetch(`http://${ip}:3001/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;

      if (healthResponse.ok) {
        const healthData = await healthResponse.json().catch(() => ({}));
        
        result = {
          status: 'running',
          latency_ms: latency,
          cpu_percent: healthData.cpu_percent || null,
          memory_percent: healthData.memory_percent || null,
          uptime_seconds: healthData.uptime_seconds || null,
          provider,
          checked_at: new Date().toISOString(),
        };

        console.log(`[VPSStatusPoll] ${provider} healthy, latency: ${latency}ms`);
      } else {
        result.status = 'stopped';
        result.latency_ms = latency;
        console.log(`[VPSStatusPoll] ${provider} unhealthy, status: ${healthResponse.status}`);
      }
    } catch (err: any) {
      const latency = Date.now() - startTime;
      
      if (err.name === 'AbortError') {
        result.status = 'stopped';
        result.latency_ms = 5000;
        console.log(`[VPSStatusPoll] ${provider} timeout after 5s`);
      } else {
        // Try a simple TCP check as fallback
        try {
          const tcpStart = Date.now();
          const tcpResponse = await fetch(`http://${ip}:22`, {
            method: 'HEAD',
            signal: AbortSignal.timeout(2000),
          }).catch(() => null);
          
          const tcpLatency = Date.now() - tcpStart;
          
          if (tcpLatency < 2000) {
            // Server is responding but HFT bot may not be installed
            result.status = 'initializing';
            result.latency_ms = tcpLatency;
            console.log(`[VPSStatusPoll] ${provider} responding but HFT not installed`);
          } else {
            result.status = 'stopped';
            result.latency_ms = latency;
          }
        } catch {
          result.status = 'stopped';
          result.latency_ms = latency;
          console.log(`[VPSStatusPoll] ${provider} not responding: ${err.message}`);
        }
      }
    }

    // Update VPS metrics in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Insert new metrics record
    await supabase.from('vps_metrics').insert({
      provider,
      cpu_percent: result.cpu_percent,
      ram_percent: result.memory_percent,
      latency_ms: result.latency_ms,
      uptime_seconds: result.uptime_seconds,
      recorded_at: result.checked_at,
    });

    // Update failover config with latest health check
    await supabase.from('failover_config').update({
      latency_ms: result.latency_ms,
      last_health_check: result.checked_at,
      consecutive_failures: result.status === 'running' ? 0 : undefined,
    }).eq('provider', provider);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[VPSStatusPoll] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
