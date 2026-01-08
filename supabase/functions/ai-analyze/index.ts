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

// Price cache with 5 second TTL (faster updates)
const priceCache: Map<string, { price: number; change: number; timestamp: number }> = new Map();
const CACHE_TTL_MS = 5000;

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
      console.log('[ai-analyze] market-scan start - analyzing top 10 pairs per connected exchange (5s updates)');
      
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
        
        // Analyze each symbol with faster rate limiting (200ms delay for 5s updates)
        for (const sym of top10) {
          try {
            // Fetch price with caching
            const priceData = await fetchPriceData(sym, exName);
            if (!priceData) continue;
            
            const { price, change } = priceData;
            const cleanSymbol = sym.replace('USDT', '');
            
            // Skip if very recent update exists (within 3 seconds) - faster updates
            const { data: recent } = await supabase
              .from('ai_market_updates')
              .select('id, current_price')
              .eq('symbol', cleanSymbol)
              .eq('exchange_name', exName)
              .gte('created_at', new Date(Date.now() - 3 * 1000).toISOString())
              .limit(1);
            
            if (recent?.length) {
              continue; // Skip - already analyzed very recently
            }
            
            // Call Groq API for HFT analysis with profit timeframe prediction
            const gr = await fetch(GROQ_API_URL, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: cfg?.model || 'llama-3.3-70b-versatile',
                messages: [
                  { role: 'system', content: 'You are an HFT scalping AI. Reply JSON only. Assign profit_timeframe_minutes based on volatility: use 1m for high volatility (>0.5% moves), 3m for medium volatility, 5m for lower volatility. Be aggressive with 1m predictions for fast-moving assets. Distribute timeframes evenly across different assets.' },
                  { role: 'user', content: `${sym} $${price.toFixed(2)} ${change >= 0 ? '+' : ''}${change.toFixed(2)}%. HFT micro-scalp analysis. JSON only:
{
  "sentiment": "BULLISH" or "BEARISH" or "NEUTRAL",
  "confidence": 0-100,
  "insight": "max 10 words",
  "support": number,
  "resistance": number,
  "profit_timeframe_minutes": 1 or 3 or 5 (based on volatility - distribute evenly),
  "recommended_side": "long" or "short",
  "expected_move_percent": 0.1 to 1.0
}
Target: $1 profit on $400 position = 0.25% move. Pick timeframe based on current volatility.` }
                ],
                max_tokens: 150,
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
            
            // Validate and normalize profit_timeframe_minutes
            let profitTimeframe = parseInt(a.profit_timeframe_minutes) || 5;
            if (![1, 3, 5].includes(profitTimeframe)) {
              profitTimeframe = 5; // Default to 5 minutes if invalid
            }
            
            // Validate recommended_side
            const recommendedSide = a.recommended_side === 'short' ? 'short' : 'long';
            
            // Validate expected_move_percent
            let expectedMove = parseFloat(a.expected_move_percent) || 0.25;
            expectedMove = Math.max(0.1, Math.min(2.0, expectedMove));
            
            await supabase.from('ai_market_updates').insert({
              symbol: cleanSymbol,
              exchange_name: exName,
              sentiment: a.sentiment || 'NEUTRAL',
              confidence: Math.min(100, Math.max(0, parseInt(a.confidence) || 50)),
              insight: a.insight || 'Analysis pending',
              current_price: price,
              price_change_24h: change,
              support_level: a.support || null,
              resistance_level: a.resistance || null,
              profit_timeframe_minutes: profitTimeframe,
              recommended_side: recommendedSide,
              expected_move_percent: expectedMove
            });
            
            exchangeCount++;
            totalAnalyzed++;
            
            // Rate limit: 200ms between API calls for faster updates (5s scan interval)
            await new Promise(r => setTimeout(r, 200));
            
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

    // Analyze last trades for learning loop
    if (action === 'analyze-last-trade') {
      const { data: trades } = await supabase
        .from('trading_journal')
        .select('*')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(10);
      
      if (!trades?.length) {
        return new Response(JSON.stringify({ success: true, message: 'No closed trades to analyze' }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      // Calculate metrics
      const avgHoldTime = trades.reduce((sum, t) => {
        if (t.created_at && t.closed_at) {
          return sum + (new Date(t.closed_at).getTime() - new Date(t.created_at).getTime()) / 1000;
        }
        return sum;
      }, 0) / trades.length;
      
      const winningTrades = trades.filter(t => (t.pnl || 0) > 0);
      const winRate = (winningTrades.length / trades.length) * 100;
      const avgProfit = trades.reduce((sum, t) => sum + (t.pnl || 0), 0) / trades.length;
      
      console.log(`[ai-analyze] Trade analysis: ${trades.length} trades, ${winRate.toFixed(1)}% win rate, avg hold ${avgHoldTime.toFixed(0)}s, avg profit $${avgProfit.toFixed(2)}`);
      
      return new Response(JSON.stringify({ 
        success: true, 
        analysis: {
          tradeCount: trades.length,
          avgHoldTimeSeconds: Math.round(avgHoldTime),
          winRate: Math.round(winRate),
          avgProfitPerTrade: avgProfit
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[ai-analyze] Error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});