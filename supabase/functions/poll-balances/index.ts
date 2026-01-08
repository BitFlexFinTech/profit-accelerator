import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decrypt } from '../_shared/encryption.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CCXT exchange mapping
const EXCHANGE_MAP: Record<string, string> = {
  'binance': 'binance',
  'okx': 'okx',
  'bybit': 'bybit',
  'bitget': 'bitget',
  'mexc': 'mexc',
  'gate.io': 'gateio',
  'kucoin': 'kucoin',
  'kraken': 'kraken',
  'bingx': 'bingx',
  'hyperliquid': 'hyperliquid',
  'nexo': 'nexo',
};

// Simulated ticker prices (in production, fetch from exchange)
const TICKER_PRICES: Record<string, number> = {
  'BTC': 96000,
  'ETH': 3400,
  'BNB': 700,
  'SOL': 180,
  'XRP': 2.3,
  'ADA': 0.95,
  'AVAX': 38,
  'DOT': 7.2,
  'MATIC': 0.55,
  'LINK': 23,
  'USDT': 1,
  'USDC': 1,
  'BUSD': 1,
  'USD': 1,
};

interface ExchangeBalance {
  exchange: string;
  totalUSDT: number;
  assets: Array<{ symbol: string; amount: number; valueUSDT: number }>;
  lastUpdated: string;
}

async function fetchExchangeBalance(
  exchangeName: string,
  apiKey: string,
  apiSecret: string,
  passphrase?: string
): Promise<ExchangeBalance | null> {
  try {
    const exchangeId = EXCHANGE_MAP[exchangeName.toLowerCase()] || exchangeName.toLowerCase();
    
    console.log(`[poll-balances] Fetching balance for ${exchangeName}...`);
    
    // For demo/testing, generate simulated balance
    // In production, use CCXT to connect to actual exchange
    const simulatedAssets = [
      { symbol: 'USDT', amount: Math.random() * 5000 + 1000 },
      { symbol: 'BTC', amount: Math.random() * 0.5 },
      { symbol: 'ETH', amount: Math.random() * 5 },
    ];
    
    const assets = simulatedAssets.map(asset => ({
      symbol: asset.symbol,
      amount: asset.amount,
      valueUSDT: asset.amount * (TICKER_PRICES[asset.symbol] || 1)
    }));
    
    const totalUSDT = assets.reduce((sum, a) => sum + a.valueUSDT, 0);
    
    return {
      exchange: exchangeName,
      totalUSDT,
      assets,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error(`[poll-balances] Error fetching ${exchangeName}:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log('[poll-balances] Starting balance poll...');

    // Get all connected exchanges with API credentials
    const { data: connections, error: connError } = await supabase
      .from('exchange_connections')
      .select('id, exchange_name, api_key, api_secret, api_passphrase, is_connected')
      .eq('is_connected', true);

    if (connError) {
      console.error('[poll-balances] Error fetching connections:', connError);
      throw connError;
    }

    if (!connections || connections.length === 0) {
      console.log('[poll-balances] No connected exchanges found');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No connected exchanges',
          balances: [],
          totalEquity: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[poll-balances] Found ${connections.length} connected exchanges`);

    const balances: ExchangeBalance[] = [];
    const updatePromises: Promise<any>[] = [];

    // Fetch balances for each connected exchange
    for (const conn of connections) {
      if (!conn.api_key || !conn.api_secret) {
        console.log(`[poll-balances] Skipping ${conn.exchange_name} - missing credentials`);
        continue;
      }

      try {
        // Decrypt API credentials
        let apiKey = conn.api_key;
        let apiSecret = conn.api_secret;
        let passphrase = conn.api_passphrase;

        // Try to decrypt if encrypted
        try {
          if (apiKey.startsWith('{')) {
            apiKey = await decrypt(apiKey);
          }
          if (apiSecret.startsWith('{')) {
            apiSecret = await decrypt(apiSecret);
          }
          if (passphrase && passphrase.startsWith('{')) {
            passphrase = await decrypt(passphrase);
          }
        } catch (decryptErr) {
          console.log(`[poll-balances] Credentials for ${conn.exchange_name} not encrypted, using as-is`);
        }

        const balance = await fetchExchangeBalance(
          conn.exchange_name,
          apiKey,
          apiSecret,
          passphrase || undefined
        );

        if (balance) {
          balances.push(balance);

          // Update exchange_connections with new balance
          updatePromises.push(
            (async () => {
              await supabase
                .from('exchange_connections')
                .update({
                  balance_usdt: balance.totalUSDT,
                  balance_updated_at: balance.lastUpdated,
                })
                .eq('id', conn.id);
            })()
          );
        }
      } catch (err) {
        console.error(`[poll-balances] Failed to process ${conn.exchange_name}:`, err);
      }
    }

    // Wait for all updates to complete
    await Promise.all(updatePromises);

    // Calculate total equity
    const totalEquity = balances.reduce((sum, b) => sum + b.totalUSDT, 0);

    // Insert into balance_history
    if (balances.length > 0) {
      const exchangeBreakdown = balances.map(b => ({
        exchange: b.exchange,
        balance: b.totalUSDT
      }));

      await supabase.from('balance_history').insert({
        total_balance: totalEquity,
        exchange_breakdown: exchangeBreakdown,
        snapshot_time: new Date().toISOString()
      });

      console.log(`[poll-balances] Recorded snapshot: $${totalEquity.toFixed(2)}`);
    }

    // Calculate 24h PnL by comparing with previous balance
    const { data: prevBalance } = await supabase
      .from('balance_history')
      .select('total_balance')
      .lt('snapshot_time', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('snapshot_time', { ascending: false })
      .limit(1)
      .single();

    const pnl24h = prevBalance ? totalEquity - prevBalance.total_balance : 0;
    const pnlPercent24h = prevBalance && prevBalance.total_balance > 0 
      ? ((totalEquity - prevBalance.total_balance) / prevBalance.total_balance) * 100 
      : 0;

    const response = {
      success: true,
      totalEquity,
      balances: balances.map(b => ({
        exchange: b.exchange,
        balance: b.totalUSDT,
        assets: b.assets
      })),
      pnl24h,
      pnlPercent24h,
      exchangeCount: balances.length,
      timestamp: new Date().toISOString()
    };

    console.log('[poll-balances] Poll completed successfully');

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[poll-balances] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
