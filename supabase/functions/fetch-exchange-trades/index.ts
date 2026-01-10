import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fetch trades from Binance
async function fetchBinanceTrades(apiKey: string, apiSecret: string): Promise<any[]> {
  const timestamp = Date.now();
  const query = `timestamp=${timestamp}&recvWindow=60000`;
  
  // Create HMAC signature
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(query));
  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  
  try {
    // Fetch recent trades from Binance
    const response = await fetch(
      `https://api.binance.com/api/v3/myTrades?symbol=BTCUSDT&limit=100&${query}&signature=${signature}`,
      { headers: { 'X-MBX-APIKEY': apiKey } }
    );
    
    if (!response.ok) {
      console.error('[fetch-exchange-trades] Binance API error:', await response.text());
      return [];
    }
    
    const trades = await response.json();
    return trades.map((t: any) => ({
      exchange: 'binance',
      symbol: t.symbol,
      side: t.isBuyer ? 'buy' : 'sell',
      price: parseFloat(t.price),
      quantity: parseFloat(t.qty),
      quoteQty: parseFloat(t.quoteQty),
      commission: parseFloat(t.commission),
      commissionAsset: t.commissionAsset,
      time: new Date(t.time).toISOString(),
      orderId: t.orderId.toString(),
      tradeId: t.id.toString(),
    }));
  } catch (err) {
    const error = err as Error;
    console.error('[fetch-exchange-trades] Error fetching Binance trades:', error.message);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[fetch-exchange-trades] Starting exchange trade audit...');

    // Fetch exchange credentials from database
    const { data: connections, error: connError } = await supabase
      .from('exchange_connections')
      .select('exchange_name, api_key, api_secret')
      .eq('is_connected', true);

    if (connError) {
      throw new Error(`Failed to fetch exchange connections: ${connError.message}`);
    }

    // Fetch existing trades from trading_journal
    const { data: existingTrades, error: tradesError } = await supabase
      .from('trading_journal')
      .select('id, symbol, exchange, created_at, entry_price, exit_price, pnl, status')
      .order('created_at', { ascending: false })
      .limit(500);

    if (tradesError) {
      throw new Error(`Failed to fetch existing trades: ${tradesError.message}`);
    }

    console.log(`[fetch-exchange-trades] Found ${existingTrades?.length || 0} existing trades in database`);

    const report = {
      timestamp: new Date().toISOString(),
      exchangeTradesFound: 0,
      databaseTradesFound: existingTrades?.length || 0,
      missingTrades: [] as any[],
      matchedTrades: 0,
      totalPnLFromExchange: 0,
      totalPnLFromDatabase: 0,
      discrepancy: 0,
    };

    // Fetch trades from each connected exchange
    for (const conn of connections || []) {
      if (conn.exchange_name === 'binance' && conn.api_key && conn.api_secret) {
        console.log('[fetch-exchange-trades] Fetching Binance trades...');
        const binanceTrades = await fetchBinanceTrades(conn.api_key, conn.api_secret);
        report.exchangeTradesFound += binanceTrades.length;
        
        // Match with database trades
        for (const exchangeTrade of binanceTrades) {
          const matched = existingTrades?.some(dbTrade => 
            dbTrade.exchange === 'binance' &&
            dbTrade.symbol === exchangeTrade.symbol &&
            Math.abs(new Date(dbTrade.created_at).getTime() - new Date(exchangeTrade.time).getTime()) < 60000
          );
          
          if (matched) {
            report.matchedTrades++;
          } else {
            report.missingTrades.push(exchangeTrade);
          }
        }
      }
    }

    // Calculate P&L from database
    report.totalPnLFromDatabase = existingTrades?.reduce((sum, t) => sum + (t.pnl || 0), 0) || 0;
    report.discrepancy = report.totalPnLFromExchange - report.totalPnLFromDatabase;

    console.log('[fetch-exchange-trades] Audit complete:', JSON.stringify(report, null, 2));

    // If there are missing trades, optionally insert them
    let body = { insert: false };
    try {
      body = await req.json();
    } catch {
      // No body or invalid JSON, use defaults
    }
    
    if (body.insert && report.missingTrades.length > 0) {
      console.log(`[fetch-exchange-trades] Inserting ${report.missingTrades.length} missing trades...`);
      
      for (const trade of report.missingTrades) {
        const { error: insertError } = await supabase
          .from('trading_journal')
          .insert({
            symbol: trade.symbol,
            exchange: trade.exchange,
            side: trade.side,
            entry_price: trade.price,
            quantity: trade.quantity,
            status: 'closed',
            created_at: trade.time,
            pnl: 0, // Unknown P&L for recovered trades
          });
        
        if (insertError) {
          console.error('[fetch-exchange-trades] Failed to insert trade:', insertError);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      report,
      message: `Found ${report.missingTrades.length} missing trades out of ${report.exchangeTradesFound} exchange trades`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const error = err as Error;
    console.error('[fetch-exchange-trades] Error:', error.message);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
