import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TRADABLE_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

// HMAC-SHA256 for Binance (hex output)
async function signBinance(query: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(query));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// HMAC-SHA256 for OKX (base64 output)
async function signOKX(timestamp: string, method: string, path: string, body: string, secret: string): Promise<string> {
  const message = timestamp + method + path + body;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  console.log('[start-live-now] ========== IMMEDIATE TRADE ORCHESTRATOR ==========');

  const result = { success: false, orderAttempted: false, orders: [] as any[], signalUsed: null as any, vpsIp: null as string | null, botStarted: false, blockingReason: null as string | null, timestamp: new Date().toISOString() };

  try {
    // Step 1: VPS check
    const { data: deployment } = await supabase.from('hft_deployments').select('id, ip_address').in('status', ['active', 'running']).limit(1).single();
    if (!deployment?.ip_address) { result.blockingReason = 'No active VPS'; return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
    result.vpsIp = deployment.ip_address;
    console.log(`[start-live-now] VPS: ${deployment.ip_address}`);

    // Step 2: Exchange credentials
    const { data: exchanges } = await supabase.from('exchange_connections').select('exchange_name, api_key, api_secret, api_passphrase').eq('is_connected', true);
    const tradableExchanges = (exchanges || []).filter(e => ['binance', 'okx'].includes(e.exchange_name.toLowerCase()) && e.api_key && e.api_secret);
    if (tradableExchanges.length === 0) { result.blockingReason = 'No Binance/OKX credentials'; return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

    // Step 3: AI signal
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: signals } = await supabase.from('ai_market_updates').select('symbol, confidence, current_price').gte('confidence', 70).gte('created_at', fiveMinAgo).in('recommended_side', ['long', 'buy']).order('confidence', { ascending: false }).limit(5);
    const tradableSignals = (signals || []).filter(s => TRADABLE_SYMBOLS.some(ts => s.symbol?.toUpperCase().includes(ts.replace('USDT', ''))));
    const topSignal = tradableSignals[0] || { symbol: 'BTCUSDT', confidence: 75, current_price: 0 };
    let symbol = (topSignal.symbol?.toUpperCase() || 'BTCUSDT').replace('/', '');
    if (!symbol.endsWith('USDT')) symbol += 'USDT';
    result.signalUsed = { ...topSignal, symbol };
    console.log(`[start-live-now] Signal: ${symbol} (${topSignal.confidence}%)`);

    // Step 4: Trading config
    const { data: config } = await supabase.from('trading_config').select('max_position_size').limit(1).single();
    const maxPos = config?.max_position_size || 350;
    await supabase.from('trading_config').update({ global_kill_switch_enabled: false, bot_status: 'running', trading_enabled: true }).neq('id', '00000000-0000-0000-0000-000000000000');

    // Step 5: Start bot container
    try { const { data } = await supabase.functions.invoke('bot-control', { body: { action: 'start', deploymentId: deployment.id } }); result.botStarted = data?.success || false; } catch { }
    console.log(`[start-live-now] Bot started: ${result.botStarted}`);

    // Step 6: Get current price
    result.orderAttempted = true;
    let currentPrice = topSignal.current_price || 0;
    if (currentPrice <= 0) {
      try { const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`); const d = await r.json(); currentPrice = parseFloat(d.price) || 100000; } catch { currentPrice = symbol.includes('BTC') ? 100000 : symbol.includes('ETH') ? 3500 : 200; }
    }
    console.log(`[start-live-now] Price: $${currentPrice}`);

    // Step 7: Try VPS /place-order first, fallback to direct API
    let vpsHasPlaceOrder = false;
    try {
      const testResp = await fetch(`http://${deployment.ip_address}/place-order`, { method: 'OPTIONS', signal: AbortSignal.timeout(3000) });
      vpsHasPlaceOrder = testResp.status !== 404;
    } catch { }
    console.log(`[start-live-now] VPS /place-order available: ${vpsHasPlaceOrder}`);

    for (const ex of tradableExchanges) {
      const name = ex.exchange_name.toLowerCase();
      const qty = name === 'binance' ? 0 : Math.floor((maxPos / currentPrice) * 10000) / 10000; // Binance uses quoteOrderQty
      const orderRes = { exchange: name, symbol, side: 'BUY', quantity: qty, price: currentPrice, orderId: null as string | null, status: 'pending', error: null as string | null };
      
      try {
        if (vpsHasPlaceOrder) {
          // Route through VPS (IP-whitelisted)
          console.log(`[start-live-now] Routing ${name} order through VPS...`);
          const vpsResp = await fetch(`http://${deployment.ip_address}/place-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exchange: name, apiKey: ex.api_key, apiSecret: ex.api_secret, passphrase: ex.api_passphrase || '', symbol, side: 'buy', orderType: 'market', quantity: qty || maxPos }),
            signal: AbortSignal.timeout(15000),
          });
          const vpsData = await vpsResp.json();
          console.log(`[start-live-now] VPS ${name}: ${JSON.stringify(vpsData).slice(0, 200)}`);
          if (vpsData.success || vpsData.orderId) { orderRes.orderId = vpsData.orderId?.toString() || 'executed'; orderRes.status = 'filled'; orderRes.quantity = vpsData.executedQty || qty; result.success = true; }
          else { orderRes.error = vpsData.error || vpsData.message || 'VPS order failed'; orderRes.status = 'failed'; }
        } else {
          // Direct API call (will fail if IP-restricted)
          console.log(`[start-live-now] Direct API call to ${name}...`);
          if (name === 'binance') {
            const ts = Date.now();
            const params = new URLSearchParams({ symbol, side: 'BUY', type: 'MARKET', quoteOrderQty: maxPos.toString(), timestamp: ts.toString() });
            params.append('signature', await signBinance(params.toString(), ex.api_secret));
            const resp = await fetch('https://api.binance.com/api/v3/order', { method: 'POST', headers: { 'X-MBX-APIKEY': ex.api_key, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString(), signal: AbortSignal.timeout(15000) });
            const data = await resp.json();
            console.log(`[start-live-now] Binance: ${resp.status} - ${JSON.stringify(data).slice(0, 200)}`);
            if (resp.ok && data.orderId) { orderRes.orderId = data.orderId.toString(); orderRes.status = 'filled'; orderRes.quantity = parseFloat(data.executedQty) || 0; result.success = true; }
            else { orderRes.error = data.msg || `HTTP ${resp.status}`; orderRes.status = 'failed'; }
          } else if (name === 'okx') {
            const ts = new Date().toISOString(), path = '/api/v5/trade/order';
            const body = JSON.stringify({ instId: symbol.replace('USDT', '-USDT'), tdMode: 'cash', side: 'buy', ordType: 'market', sz: qty.toString() });
            const sign = await signOKX(ts, 'POST', path, body, ex.api_secret);
            const resp = await fetch(`https://www.okx.com${path}`, { method: 'POST', headers: { 'OK-ACCESS-KEY': ex.api_key, 'OK-ACCESS-SIGN': sign, 'OK-ACCESS-TIMESTAMP': ts, 'OK-ACCESS-PASSPHRASE': ex.api_passphrase || '', 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(15000) });
            const data = await resp.json();
            console.log(`[start-live-now] OKX: ${resp.status} - ${JSON.stringify(data).slice(0, 200)}`);
            if (data.code === '0' && data.data?.[0]?.ordId) { orderRes.orderId = data.data[0].ordId; orderRes.status = 'filled'; result.success = true; }
            else { orderRes.error = data.data?.[0]?.sMsg || data.msg || `HTTP ${resp.status}`; orderRes.status = 'failed'; }
          }
        }
        
        if (orderRes.status === 'filled') { 
          await supabase.from('trading_journal').insert({ exchange: name, symbol, side: 'long', entry_price: currentPrice, quantity: orderRes.quantity, ai_reasoning: `AI ${topSignal.confidence}% confidence`, status: 'open' }); 
          console.log(`[start-live-now] ✅ ${name} ORDER SUCCESS: ${orderRes.orderId}`);
        }
      } catch (e) { orderRes.error = e instanceof Error ? e.message : 'Error'; orderRes.status = 'failed'; }
      result.orders.push(orderRes);
    }

    if (!result.success) {
      // Check if all failures are IP-related
      const ipErrors = result.orders.filter(o => o.error?.includes('IP') || o.error?.includes('whitelist'));
      if (ipErrors.length === result.orders.length) {
        result.blockingReason = `API keys are IP-restricted to VPS. Update VPS with /place-order endpoint or whitelist Supabase IPs. VPS IP: ${deployment.ip_address}`;
      } else {
        result.blockingReason = result.orders.map(o => `${o.exchange}: ${o.error}`).join('; ');
      }
    }
    
    console.log(`[start-live-now] Result: ${result.success ? '✅ SUCCESS' : '❌ FAILED'} - ${result.blockingReason || 'OK'}`);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    result.blockingReason = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
