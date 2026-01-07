import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { action, symbol, model } = body;
    console.log(`[ai-analyze] Action: ${action}, hasKey: ${!!GROQ_API_KEY}`);

    if (action === 'validate-key') {
      if (!GROQ_API_KEY) {
        return new Response(JSON.stringify({ success: false, error: 'GROQ_API_KEY not set in Supabase secrets' }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const resp = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 }),
      });
      return new Response(JSON.stringify({ success: resp.ok, error: resp.ok ? null : 'Invalid key' }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'get-config') {
      const { data } = await supabase.from('ai_config').select('provider, model, is_active, last_used_at').eq('provider', 'groq').single();
      return new Response(JSON.stringify({ success: true, config: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'save-config') {
      await supabase.from('ai_config').upsert({ provider: 'groq', model: model || 'llama-3.3-70b-versatile', is_active: true }, { onConflict: 'provider' });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'analyze') {
      if (!GROQ_API_KEY) {
        return new Response(JSON.stringify({ success: false, error: 'GROQ_API_KEY not configured' }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: cfg } = await supabase.from('ai_config').select('model, is_active, id').eq('provider', 'groq').single();
      if (cfg && !cfg.is_active) {
        return new Response(JSON.stringify({ success: false, error: 'AI not active' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const sym = (symbol || 'BTC').toUpperCase();
      let ctx = `${sym}/USDT data.`;
      try {
        const pr = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}USDT`);
        if (pr.ok) { const t = await pr.json(); ctx = `${sym} at $${parseFloat(t.lastPrice).toFixed(2)}, ${parseFloat(t.priceChangePercent).toFixed(2)}% 24h`; }
      } catch {}
      const resp = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg?.model || 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: 'Crypto analyst.' }, { role: 'user', content: `Analyze ${sym}. ${ctx} Give sentiment, levels, outlook.` }],
          max_tokens: 400,
        }),
      });
      if (!resp.ok) return new Response(JSON.stringify({ success: false, error: 'Groq API error' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const d = await resp.json();
      if (cfg?.id) await supabase.from('ai_config').update({ last_used_at: new Date().toISOString() }).eq('id', cfg.id);
      return new Response(JSON.stringify({ success: true, symbol: sym, analysis: d.choices?.[0]?.message?.content || 'No analysis' }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'market-scan') {
      console.log('[ai-analyze] market-scan start');
      const { data: ex } = await supabase.from('exchange_connections').select('exchange_name').eq('is_connected', true);
      if (!ex?.length) return new Response(JSON.stringify({ success: false, error: 'No exchanges connected' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (!GROQ_API_KEY) return new Response(JSON.stringify({ success: false, error: 'GROQ_API_KEY not set' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      
      const { data: cfg } = await supabase.from('ai_config').select('model, id').eq('provider', 'groq').single();
      const exName = ex[0].exchange_name.toLowerCase();
      // Expanded asset coverage: BTC, ETH, SOL, DOGE, XRP, ADA, AVAX, LINK
      const syms = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'XRPUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT'];
      let count = 0;

      for (const s of syms) {
        try {
          const url = exName === 'okx' ? `https://www.okx.com/api/v5/market/ticker?instId=${s.replace('USDT', '-USDT')}` 
            : exName === 'bybit' ? `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${s}` 
            : `https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`;
          const pr = await fetch(url);
          if (!pr.ok) continue;
          const raw = await pr.json();
          let price = 0, chg = 0;
          if (exName === 'okx' && raw.data?.[0]) { price = parseFloat(raw.data[0].last); chg = ((price - parseFloat(raw.data[0].open24h)) / parseFloat(raw.data[0].open24h)) * 100; }
          else if (exName === 'bybit' && raw.result?.list?.[0]) { price = parseFloat(raw.result.list[0].lastPrice); chg = parseFloat(raw.result.list[0].price24hPcnt) * 100; }
          else { price = parseFloat(raw.lastPrice || '0'); chg = parseFloat(raw.priceChangePercent || '0'); }
          
          const gr = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: cfg?.model || 'llama-3.3-70b-versatile',
              messages: [{ role: 'system', content: 'Reply JSON only.' }, { role: 'user', content: `${s} $${price.toFixed(2)} ${chg.toFixed(2)}%. JSON: {"sentiment":"BULLISH/BEARISH/NEUTRAL","confidence":0-100,"insight":"1 sentence","support":num,"resistance":num}` }],
              max_tokens: 150,
            }),
          });
          if (!gr.ok) continue;
          const gd = await gr.json();
          const txt = gd.choices?.[0]?.message?.content;
          if (!txt) continue;
          const m = txt.match(/\{[\s\S]*\}/);
          if (!m) continue;
          const a = JSON.parse(m[0]);
          await supabase.from('ai_market_updates').insert({
            symbol: s.replace('USDT', ''), exchange_name: exName, sentiment: a.sentiment || 'NEUTRAL',
            confidence: Math.min(100, Math.max(0, parseInt(a.confidence) || 50)), insight: a.insight || 'Analysis pending',
            current_price: price, price_change_24h: chg, support_level: a.support || null, resistance_level: a.resistance || null
          });
          count++;
        } catch (e) { console.error(`[ai-analyze] ${s} error:`, e); }
      }
      if (cfg?.id) await supabase.from('ai_config').update({ last_used_at: new Date().toISOString() }).eq('id', cfg.id);
      return new Response(JSON.stringify({ success: true, analyzed: count, exchange: exName }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[ai-analyze] Error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
