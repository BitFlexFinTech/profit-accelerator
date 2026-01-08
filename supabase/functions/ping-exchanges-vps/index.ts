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

  try {
    const supabase = createClient(
      'https://iibdlazwkossyelyroap.supabase.co',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // Get active VPS instances
    const { data: instances } = await supabase
      .from('vps_instances')
      .select('ip_address, provider, region')
      .eq('status', 'running')
      .not('ip_address', 'is', null)
      .limit(1);

    if (!instances || instances.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No active VPS found',
        source: 'edge'
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const vps = instances[0];
    console.log(`[ping-exchanges-vps] Pinging exchanges from VPS: ${vps.ip_address}`);

    // Call the VPS /ping-exchanges endpoint
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const vpsResponse = await fetch(`http://${vps.ip_address}:8080/ping-exchanges`, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!vpsResponse.ok) {
        throw new Error(`VPS returned ${vpsResponse.status}`);
      }

      const vpsData = await vpsResponse.json();
      console.log(`[ping-exchanges-vps] VPS returned ${vpsData.pings?.length || 0} pings`);

      // Update exchange_pulse table with VPS latency data
      const updates = [];
      for (const ping of vpsData.pings || []) {
        const status = ping.status === 'ok' 
          ? (ping.latency_ms < 30 ? 'healthy' : ping.latency_ms < 80 ? 'jitter' : 'error')
          : 'error';

        updates.push(
          supabase.from('exchange_pulse').upsert({
            exchange_name: ping.exchange,
            latency_ms: ping.latency_ms,
            status: status,
            last_check: new Date().toISOString(),
            region: `vps-${vps.region || 'unknown'}`,
            source: 'vps',
            error_message: ping.error || null
          }, { 
            onConflict: 'exchange_name'
          })
        );
      }

      await Promise.all(updates);

      return new Response(JSON.stringify({
        success: true,
        source: 'vps',
        vps_ip: vps.ip_address,
        vps_region: vps.region,
        pings: vpsData.pings || []
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (fetchErr: unknown) {
      clearTimeout(timeoutId);
      const errMessage = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error(`[ping-exchanges-vps] Failed to reach VPS:`, errMessage);
      
      return new Response(JSON.stringify({
        success: false,
        error: `VPS unreachable: ${errMessage}`,
        vps_ip: vps.ip_address,
        source: 'edge'
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (err) {
    console.error('[ping-exchanges-vps] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: String(err)
    }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
