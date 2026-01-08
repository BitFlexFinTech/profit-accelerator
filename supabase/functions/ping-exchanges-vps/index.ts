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

    // Try vps_config first (has actual VPS data), then fall back to vps_instances
    let vps: { ip_address: string | null; provider: string | null; region: string | null } | null = null;

    // Check vps_config table first
    const { data: vpsConfig } = await supabase
      .from('vps_config')
      .select('outbound_ip, provider, region')
      .eq('status', 'running')
      .not('outbound_ip', 'is', null)
      .limit(1)
      .single();

    if (vpsConfig?.outbound_ip) {
      vps = {
        ip_address: vpsConfig.outbound_ip,
        provider: vpsConfig.provider,
        region: vpsConfig.region
      };
    } else {
      // Fall back to vps_instances
      const { data: instances } = await supabase
        .from('vps_instances')
        .select('ip_address, provider, region')
        .eq('status', 'running')
        .not('ip_address', 'is', null)
        .limit(1);

      if (instances && instances.length > 0) {
        vps = instances[0];
      }
    }

    if (!vps || !vps.ip_address) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No active VPS found. Configure VPS in Settings.',
        source: 'edge'
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
console.log(`[ping-exchanges-vps] Pinging exchanges from VPS: ${vps.ip_address} (${vps.region})`);

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

      // Get latency alert config
      const { data: alertConfig } = await supabase
        .from('alert_config')
        .select('*')
        .eq('alert_type', 'latency_high')
        .eq('is_enabled', true)
        .single();

      const latencyThreshold = alertConfig?.threshold_value || 100;
      const highLatencyExchanges: string[] = [];

      // Update exchange_pulse table with VPS latency data
      const updates = [];
      const historyInserts = [];
      
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

        // Add to history for trend tracking
        historyInserts.push({
          exchange_name: ping.exchange,
          latency_ms: ping.latency_ms,
          source: 'vps',
          region: vps.region
        });

        // Check for high latency alerts
        if (alertConfig && ping.latency_ms > latencyThreshold) {
          highLatencyExchanges.push(`${ping.exchange}: ${Math.round(ping.latency_ms)}ms`);
        }
      }

      await Promise.all(updates);

      // Insert history records
      if (historyInserts.length > 0) {
        await supabase.from('exchange_latency_history').insert(historyInserts);
      }

      // Send Telegram alert if any exchanges exceeded threshold
      if (highLatencyExchanges.length > 0) {
        const alertMessage = `⚠️ <b>HIGH LATENCY ALERT</b>\n\n` +
          `Threshold: ${latencyThreshold}ms\n` +
          `Measured from VPS (${vps.region || 'unknown'})\n\n` +
          highLatencyExchanges.join('\n');

        await supabase.functions.invoke('telegram-bot', {
          body: {
            action: 'send-message',
            message: alertMessage
          }
        });

        // Log to alert history
        await supabase.from('alert_history').insert({
          alert_type: 'latency_high',
          channel: 'telegram',
          message: `High latency detected: ${highLatencyExchanges.join(', ')}`,
          severity: 'warning'
        });
      }

      return new Response(JSON.stringify({
        success: true,
        source: 'vps',
        vps_ip: vps.ip_address,
        vps_region: vps.region,
        pings: vpsData.pings || [],
        alerts_sent: highLatencyExchanges.length
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
