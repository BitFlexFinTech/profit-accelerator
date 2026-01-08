import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');

// Exchange API endpoints for fetching top pairs by volume
const EXCHANGE_ENDPOINTS: Record<string, { ticker24h: string; parseTop10: (data: any) => string[] }> = {
  binance: {
    ticker24h: 'https://api.binance.com/api/v3/ticker/24hr',
    parseTop10: (data: any[]) => data
      .filter((t: any) => t.symbol.endsWith('USDT') && !t.symbol.includes('UP') && !t.symbol.includes('DOWN'))
      .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 10)
      .map((t: any) => t.symbol)
  },
  okx: {
    ticker24h: 'https://www.okx.com/api/v5/market/tickers?instType=SPOT',
    parseTop10: (data: any) => (data.data || [])
      .filter((t: any) => t.instId.endsWith('-USDT'))
      .sort((a: any, b: any) => parseFloat(b.volCcy24h) - parseFloat(a.volCcy24h))
      .slice(0, 10)
      .map((t: any) => t.instId.replace('-USDT', 'USDT'))
  },
  bybit: {
    ticker24h: 'https://api.bybit.com/v5/market/tickers?category=spot',
    parseTop10: (data: any) => (data.result?.list || [])
      .filter((t: any) => t.symbol.endsWith('USDT'))
      .sort((a: any, b: any) => parseFloat(b.turnover24h) - parseFloat(a.turnover24h))
      .slice(0, 10)
      .map((t: any) => t.symbol)
  }
};

// Price cache to avoid redundant API calls (30 second TTL)
const priceCache: Map<string, { price: number; change: number; timestamp: number }> = new Map();
const CACHE_TTL_MS = 30000;

async function fetchPriceData(symbol: string, exchange: string): Promise<{ price: number; change: number } | null> {
  const cacheKey = `${exchange}:${symbol}`;
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { price: cached.price, change: cached.change };
  }

  try {
    let url: string;
    const cleanSymbol = symbol.replace('USDT', '');
    
    if (exchange === 'okx') {
      url = `https://www.okx.com/api/v5/market/ticker?instId=${cleanSymbol}-USDT`;
    } else if (exchange === 'bybit') {
      url = `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`;
    } else {
      url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
    }

    const resp = await fetch(url);
    if (!resp.ok) return null;

    const raw = await resp.json();
    let price = 0, change = 0;

    if (exchange === 'okx' && raw.data?.[0]) {
      price = parseFloat(raw.data[0].last);
      change = ((price - parseFloat(raw.data[0].open24h)) / parseFloat(raw.data[0].open24h)) * 100;
    } else if (exchange === 'bybit' && raw.result?.list?.[0]) {
      price = parseFloat(raw.result.list[0].lastPrice);
      change = parseFloat(raw.result.list[0].price24hPcnt) * 100;
    } else {
      price = parseFloat(raw.lastPrice || '0');
      change = parseFloat(raw.priceChangePercent || '0');
    }

    priceCache.set(cacheKey, { price, change, timestamp: Date.now() });
    return { price, change };
  } catch (e) {
    console.error(`[ai-analyze] Failed to fetch price for ${symbol}:`, e);
    return null;
  }
}

async function getTop10Pairs(exchange: string): Promise<string[]> {
  const config = EXCHANGE_ENDPOINTS[exchange] || EXCHANGE_ENDPOINTS.binance;
  try {
    const resp = await fetch(config.ticker24h);
    if (!resp.ok) {
      console.log(`[ai-analyze] Failed to fetch tickers for ${exchange}, using defaults`);
      return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'BNBUSDT', 'MATICUSDT'];
    }
    const data = await resp.json();
    return config.parseTop10(data);
  } catch (e) {
    console.error(`[ai-analyze] Error fetching top pairs for ${exchange}:`, e);
    return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'BNBUSDT', 'MATICUSDT'];
  }
}

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
      console.log('[ai-analyze] market-scan start - analyzing top 10 pairs per connected exchange');
      
      // Get ALL connected exchanges
      const { data: exchanges } = await supabase
        .from('exchange_connections')
        .select('exchange_name')
        .eq('is_connected', true);
      
      if (!exchanges?.length) {
        return new Response(JSON.stringify({ success: false, error: 'No exchanges connected' }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      if (!GROQ_API_KEY) {
        return new Response(JSON.stringify({ success: false, error: 'GROQ_API_KEY not set' }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      const { data: cfg } = await supabase.from('ai_config').select('model, id').eq('provider', 'groq').single();
      let totalAnalyzed = 0;
      const exchangeResults: Record<string, number> = {};

      // Process each connected exchange
      for (const ex of exchanges) {
        const exName = ex.exchange_name.toLowerCase();
        console.log(`[ai-analyze] Processing exchange: ${exName}`);
        
        // Get top 10 pairs by volume for this exchange
        const top10 = await getTop10Pairs(exName);
        console.log(`[ai-analyze] Top 10 for ${exName}:`, top10);
        
        let exchangeCount = 0;
        
        // Analyze each symbol with rate limiting (max 2 per second to avoid rate limits)
        for (const sym of top10) {
          try {
            // Fetch price with caching
            const priceData = await fetchPriceData(sym, exName);
            if (!priceData) continue;
            
            const { price, change } = priceData;
            const cleanSymbol = sym.replace('USDT', '');
            
            // Check if we recently analyzed this symbol (skip if <5 minutes old and price change <0.5%)
            const { data: recent } = await supabase
              .from('ai_market_updates')
              .select('id, current_price')
              .eq('symbol', cleanSymbol)
              .eq('exchange_name', exName)
              .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
              .limit(1);
            
            if (recent?.length) {
              const oldPrice = recent[0].current_price;
              const priceChangePct = Math.abs((price - oldPrice) / oldPrice * 100);
              if (priceChangePct < 0.5) {
                console.log(`[ai-analyze] Skipping ${cleanSymbol} - price barely changed (${priceChangePct.toFixed(2)}%)`);
                continue;
              }
            }
            
            // Call Groq API for analysis
            const gr = await fetch(GROQ_API_URL, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: cfg?.model || 'llama-3.3-70b-versatile',
                messages: [
                  { role: 'system', content: 'Reply JSON only. Be concise.' },
                  { role: 'user', content: `${sym} $${price.toFixed(2)} ${change >= 0 ? '+' : ''}${change.toFixed(2)}%. JSON: {"sentiment":"BULLISH/BEARISH/NEUTRAL","confidence":0-100,"insight":"1 sentence max 15 words","support":number,"resistance":number}` }
                ],
                max_tokens: 100,
              }),
            });
            
            if (!gr.ok) {
              console.error(`[ai-analyze] Groq API error for ${sym}`);
              continue;
            }
            
            const gd = await gr.json();
            const txt = gd.choices?.[0]?.message?.content;
            if (!txt) continue;
            
            const m = txt.match(/\{[\s\S]*\}/);
            if (!m) continue;
            
            const a = JSON.parse(m[0]);
            
            await supabase.from('ai_market_updates').insert({
              symbol: cleanSymbol,
              exchange_name: exName,
              sentiment: a.sentiment || 'NEUTRAL',
              confidence: Math.min(100, Math.max(0, parseInt(a.confidence) || 50)),
              insight: a.insight || 'Analysis pending',
              current_price: price,
              price_change_24h: change,
              support_level: a.support || null,
              resistance_level: a.resistance || null
            });
            
            exchangeCount++;
            totalAnalyzed++;
            
            // Rate limit: 500ms between API calls to avoid hitting limits
            await new Promise(r => setTimeout(r, 500));
            
          } catch (e) {
            console.error(`[ai-analyze] Error analyzing ${sym}:`, e);
          }
        }
        
        exchangeResults[exName] = exchangeCount;
      }
      
      if (cfg?.id) {
        await supabase.from('ai_config').update({ last_used_at: new Date().toISOString() }).eq('id', cfg.id);
      }
      
      console.log(`[ai-analyze] market-scan complete: ${totalAnalyzed} total analyzed`, exchangeResults);
      
      return new Response(JSON.stringify({ 
        success: true, 
        analyzed: totalAnalyzed, 
        exchanges: exchangeResults,
        message: `Analyzed top 10 pairs for ${Object.keys(exchangeResults).length} exchange(s)`
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[ai-analyze] Error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
