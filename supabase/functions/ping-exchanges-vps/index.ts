import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// List of exchanges to ping
const exchangeEndpoints = [
  { name: 'binance', url: 'https://api.binance.com/api/v3/ping' },
  { name: 'okx', url: 'https://www.okx.com/api/v5/public/time' },
  { name: 'bybit', url: 'https://api.bybit.com/v5/market/time' },
  { name: 'bitget', url: 'https://api.bitget.com/api/v2/public/time' },
  { name: 'bingx', url: 'https://open-api.bingx.com/openApi/swap/v2/server/time' },
  { name: 'mexc', url: 'https://api.mexc.com/api/v3/ping' },
  { name: 'gateio', url: 'https://api.gateio.ws/api/v4/spot/time' },
  { name: 'kucoin', url: 'https://api.kucoin.com/api/v1/timestamp' },
  { name: 'kraken', url: 'https://api.kraken.com/0/public/Time' },
  { name: 'hyperliquid', url: 'https://api.hyperliquid.xyz/info' }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      'https://iibdlazwkossyelyroap.supabase.co',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // Get VPS config
    let vps: { ip_address: string | null; provider: string | null; region: string | null } | null = null;

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

    // Default region if no VPS configured
    const vpsRegion = vps?.region || 'edge';
    const vpsIp = vps?.ip_address || 'edge';

    console.log(`[ping-exchanges-vps] Pinging ${exchangeEndpoints.length} exchanges (VPS: ${vpsIp}, Region: ${vpsRegion})`);

    let pingResults: Array<{ exchange: string; latency_ms: number; status: string; error?: string }> = [];
    let source: 'vps' | 'edge' = 'edge';

    // Try VPS endpoint first if we have a VPS
    if (vps?.ip_address) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const vpsResponse = await fetch(`http://${vps.ip_address}:8080/ping-exchanges`, {
          method: 'GET',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (vpsResponse.ok) {
          const vpsData = await vpsResponse.json();
          if (vpsData.pings && vpsData.pings.length > 0) {
            pingResults = vpsData.pings;
            source = 'vps';
            console.log(`[ping-exchanges-vps] VPS returned ${pingResults.length} pings`);
          }
        } else {
          console.log(`[ping-exchanges-vps] VPS returned ${vpsResponse.status}, falling back to edge`);
        }
      } catch (err) {
        console.log(`[ping-exchanges-vps] VPS unreachable, falling back to edge pings`);
      }
    }

    // If VPS didn't work, ping directly from edge function
    if (pingResults.length === 0) {
      console.log(`[ping-exchanges-vps] Performing direct edge pings...`);
      
      pingResults = await Promise.all(exchangeEndpoints.map(async (ex) => {
        const start = Date.now();
        try {
          const pingController = new AbortController();
          const pingTimeout = setTimeout(() => pingController.abort(), 5000);
          
          await fetch(ex.url, { 
            method: 'GET',
            signal: pingController.signal
          });
          
          clearTimeout(pingTimeout);
          const latency = Date.now() - start;
          return { exchange: ex.name, latency_ms: latency, status: 'ok' };
        } catch {
          const latency = Date.now() - start;
          return { exchange: ex.name, latency_ms: latency, status: 'error', error: 'Timeout or unreachable' };
        }
      }));

      source = 'edge';
    }

    // Get latency alert config
    const { data: alertConfig } = await supabase
      .from('alert_config')
      .select('*')
      .eq('alert_type', 'latency_high')
      .eq('is_enabled', true)
      .single();

    const latencyThreshold = alertConfig?.threshold_value || 100;
    const highLatencyExchanges: string[] = [];

    // Update exchange_pulse table with latency data
    const updates = [];
    const historyInserts = [];
    
    for (const ping of pingResults) {
      const status = ping.status === 'ok' 
        ? (ping.latency_ms < 30 ? 'healthy' : ping.latency_ms < 80 ? 'jitter' : 'error')
        : 'error';

      updates.push(
        supabase.from('exchange_pulse').upsert({
          exchange_name: ping.exchange,
          latency_ms: ping.latency_ms,
          status: status,
          last_check: new Date().toISOString(),
          region: source === 'vps' ? `vps-${vpsRegion}` : 'edge',
          source: source,
          error_message: ping.error || null
        }, { 
          onConflict: 'exchange_name'
        })
      );

      // Add to history for trend tracking
      historyInserts.push({
        exchange_name: ping.exchange,
        latency_ms: ping.latency_ms,
        source: source,
        region: vpsRegion
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
        `Source: ${source === 'vps' ? `VPS (${vpsRegion})` : 'Edge'}\n\n` +
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
      source: source,
      vps_ip: vpsIp,
      vps_region: vpsRegion,
      pings: pingResults,
      alerts_sent: highLatencyExchanges.length
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

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
