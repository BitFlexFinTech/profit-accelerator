import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MarketData {
  symbol: string;
  exchange: 'binance' | 'okx';
  price: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  bidPrice: number;
  askPrice: number;
  spread: number;
  spreadPercent: number;
  timestamp: number;
}

// Top 10 cryptocurrencies to track (by market cap)
const TOP_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT',
  'DOGEUSDT', 'SOLUSDT', 'MATICUSDT', 'DOTUSDT', 'SHIBUSDT'
];

async function fetchBinanceData(): Promise<MarketData[]> {
  const results: MarketData[] = [];
  
  try {
    // Fetch 24hr ticker data for all symbols in one call
    const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    if (!response.ok) throw new Error('Binance API error');
    
    const tickers = await response.json();
    const timestamp = Date.now();
    
    for (const symbol of TOP_SYMBOLS) {
      const ticker = tickers.find((t: any) => t.symbol === symbol);
      if (!ticker) continue;
      
      const price = parseFloat(ticker.lastPrice);
      const bidPrice = parseFloat(ticker.bidPrice);
      const askPrice = parseFloat(ticker.askPrice);
      const spread = askPrice - bidPrice;
      
      results.push({
        symbol,
        exchange: 'binance',
        price,
        priceChange24h: parseFloat(ticker.priceChange),
        priceChangePercent24h: parseFloat(ticker.priceChangePercent),
        volume24h: parseFloat(ticker.volume),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
        bidPrice,
        askPrice,
        spread,
        spreadPercent: (spread / price) * 100,
        timestamp,
      });
    }
    
    console.log(`[HFT] Fetched ${results.length} symbols from Binance`);
  } catch (err) {
    console.error('[HFT] Binance fetch error:', err);
  }
  
  return results;
}

async function fetchOKXData(): Promise<MarketData[]> {
  const results: MarketData[] = [];
  
  try {
    // OKX uses different symbol format (BTC-USDT instead of BTCUSDT)
    const okxSymbols = TOP_SYMBOLS.map(s => s.replace('USDT', '-USDT'));
    
    // Fetch all tickers
    const response = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
    if (!response.ok) throw new Error('OKX API error');
    
    const data = await response.json();
    const tickers = data.data || [];
    const timestamp = Date.now();
    
    for (let i = 0; i < TOP_SYMBOLS.length; i++) {
      const okxSymbol = okxSymbols[i];
      const ticker = tickers.find((t: any) => t.instId === okxSymbol);
      if (!ticker) continue;
      
      const price = parseFloat(ticker.last);
      const bidPrice = parseFloat(ticker.bidPx);
      const askPrice = parseFloat(ticker.askPx);
      const spread = askPrice - bidPrice;
      const open24h = parseFloat(ticker.open24h);
      const priceChange = price - open24h;
      
      results.push({
        symbol: TOP_SYMBOLS[i],
        exchange: 'okx',
        price,
        priceChange24h: priceChange,
        priceChangePercent24h: (priceChange / open24h) * 100,
        volume24h: parseFloat(ticker.vol24h),
        high24h: parseFloat(ticker.high24h),
        low24h: parseFloat(ticker.low24h),
        bidPrice,
        askPrice,
        spread,
        spreadPercent: (spread / price) * 100,
        timestamp,
      });
    }
    
    console.log(`[HFT] Fetched ${results.length} symbols from OKX`);
  } catch (err) {
    console.error('[HFT] OKX fetch error:', err);
  }
  
  return results;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, exchange } = await req.json().catch(() => ({ action: 'fetch-all' }));

    console.log(`[HFT] Action: ${action}, Exchange: ${exchange || 'all'}`);

    const startTime = Date.now();
    let binanceData: MarketData[] = [];
    let okxData: MarketData[] = [];

    // Check which exchanges are connected
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: exchanges } = await supabase
      .from('exchange_connections')
      .select('exchange_name, is_connected')
      .eq('is_connected', true);

    const connectedExchanges = new Set(
      (exchanges || []).map(e => e.exchange_name.toLowerCase())
    );

    // Fetch data from connected exchanges only
    const fetchPromises: Promise<void>[] = [];

    if (!exchange || exchange === 'binance' || connectedExchanges.has('binance')) {
      fetchPromises.push(
        fetchBinanceData().then(data => { binanceData = data; })
      );
    }

    if (!exchange || exchange === 'okx' || connectedExchanges.has('okx')) {
      fetchPromises.push(
        fetchOKXData().then(data => { okxData = data; })
      );
    }

    await Promise.all(fetchPromises);

    const latency = Date.now() - startTime;

    // Calculate summary stats
    const totalDataPoints = binanceData.length + okxData.length;
    const avgBinanceSpread = binanceData.length > 0
      ? binanceData.reduce((sum, d) => sum + d.spreadPercent, 0) / binanceData.length
      : 0;
    const avgOkxSpread = okxData.length > 0
      ? okxData.reduce((sum, d) => sum + d.spreadPercent, 0) / okxData.length
      : 0;

    const response = {
      success: true,
      latency_ms: latency,
      timestamp: Date.now(),
      data_freshness_ms: latency,
      exchanges: {
        binance: {
          connected: connectedExchanges.has('binance') || binanceData.length > 0,
          data: binanceData,
          count: binanceData.length,
          avg_spread_percent: avgBinanceSpread,
        },
        okx: {
          connected: connectedExchanges.has('okx') || okxData.length > 0,
          data: okxData,
          count: okxData.length,
          avg_spread_percent: avgOkxSpread,
        },
      },
      summary: {
        total_symbols: totalDataPoints,
        fetch_latency_ms: latency,
        exchanges_polled: fetchPromises.length,
      },
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[HFT] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
