import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

// Fallback ticker prices for assets without market data
const FALLBACK_PRICES: Record<string, number> = {
  'USDT': 1,
  'USDC': 1,
  'BUSD': 1,
  'USD': 1,
  'DAI': 1,
  'TUSD': 1,
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
    
    console.log(`[poll-balances] Fetching real balance for ${exchangeName} via CCXT...`);
    
    // Dynamic import CCXT
    const ccxt = await import('https://esm.sh/ccxt@4.5.31');
    
    // Check if exchange is supported
    const ExchangeClass = (ccxt as any)[exchangeId];
    if (!ExchangeClass) {
      console.error(`[poll-balances] Exchange ${exchangeId} not supported by CCXT`);
      return null;
    }
    
    // Initialize exchange with credentials
    const exchangeConfig: Record<string, any> = {
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
      timeout: 30000,
    };
    
    // Add passphrase for exchanges that require it (OKX, KuCoin, etc.)
    if (passphrase) {
      exchangeConfig.password = passphrase;
    }
    
    // Special handling for specific exchanges
    if (exchangeId === 'binance') {
      exchangeConfig.options = { defaultType: 'spot' };
    } else if (exchangeId === 'bybit') {
      exchangeConfig.options = { defaultType: 'unified' };
    }
    
    const exchange = new ExchangeClass(exchangeConfig);
    
    // Fetch balance
    const balance = await exchange.fetchBalance();
    
    // Fetch tickers for non-stablecoin assets to get USD values
    const assets: Array<{ symbol: string; amount: number; valueUSDT: number }> = [];
    let totalUSDT = 0;
    
    // Get list of assets with balance > 0
    const assetSymbols = Object.keys(balance.total || {}).filter(
      symbol => balance.total[symbol] > 0 && symbol !== 'info'
    );
    
    console.log(`[poll-balances] ${exchangeName} has ${assetSymbols.length} assets with balance`);
    
    for (const symbol of assetSymbols) {
      const amount = balance.total[symbol];
      let valueUSDT = 0;
      
      // For stablecoins, use 1:1 conversion
      if (FALLBACK_PRICES[symbol]) {
        valueUSDT = amount * FALLBACK_PRICES[symbol];
      } else {
        // Try to fetch ticker price
        try {
          const ticker = await exchange.fetchTicker(`${symbol}/USDT`);
          if (ticker?.last) {
            valueUSDT = amount * ticker.last;
          }
        } catch (tickerErr) {
          // Try BTC pair as fallback
          try {
            const btcTicker = await exchange.fetchTicker(`${symbol}/BTC`);
            const btcUsdtTicker = await exchange.fetchTicker('BTC/USDT');
            if (btcTicker?.last && btcUsdtTicker?.last) {
              valueUSDT = amount * btcTicker.last * btcUsdtTicker.last;
            }
          } catch {
            console.log(`[poll-balances] Could not get price for ${symbol}, skipping`);
            continue;
          }
        }
      }
      
      if (valueUSDT > 0.01) { // Only include assets worth more than 1 cent
        assets.push({ symbol, amount, valueUSDT });
        totalUSDT += valueUSDT;
      }
    }
    
    console.log(`[poll-balances] ${exchangeName} total: $${totalUSDT.toFixed(2)}`);
    
    return {
      exchange: exchangeName,
      totalUSDT,
      assets,
      lastUpdated: new Date().toISOString()
    };
  } catch (error: any) {
    console.error(`[poll-balances] Error fetching ${exchangeName}:`, error.message);
    
    // Return error info for caller to handle
    throw {
      exchangeName,
      message: error.message,
      isIPError: error.message?.includes('-2015') || error.message?.includes('Invalid API-key'),
      isPassphraseError: error.message?.includes('requires "password"') || error.message?.includes('passphrase')
    };
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

    console.log('[poll-balances] Starting real balance poll...');

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

      // Decrypt API credentials if encrypted
      let apiKey = conn.api_key;
      let apiSecret = conn.api_secret;
      let passphrase = conn.api_passphrase;

      // Try to decrypt if it looks like encrypted JSON
      try {
        if (apiKey.startsWith('{') && apiKey.includes('iv')) {
          const { decrypt } = await import('../_shared/encryption.ts');
          apiKey = await decrypt(apiKey);
        }
        if (apiSecret.startsWith('{') && apiSecret.includes('iv')) {
          const { decrypt } = await import('../_shared/encryption.ts');
          apiSecret = await decrypt(apiSecret);
        }
        if (passphrase && passphrase.startsWith('{') && passphrase.includes('iv')) {
          const { decrypt } = await import('../_shared/encryption.ts');
          passphrase = await decrypt(passphrase);
        }
      } catch (decryptErr) {
        console.log(`[poll-balances] Credentials for ${conn.exchange_name} not encrypted, using as-is`);
      }

      try {
        const balance = await fetchExchangeBalance(
          conn.exchange_name,
          apiKey,
          apiSecret,
          passphrase || undefined
        );

        if (balance) {
          balances.push(balance);

          // Update exchange_connections with new balance and clear any previous error
          updatePromises.push(
            (async () => {
              await supabase
                .from('exchange_connections')
                .update({
                  balance_usdt: balance.totalUSDT,
                  balance_updated_at: balance.lastUpdated,
                  last_error: null,
                  last_error_at: null,
                })
                .eq('id', conn.id);
            })()
          );
        }
      } catch (err: any) {
        // Generate user-friendly error message
        let userMessage = err.message || 'Unknown error';
        
        if (err.isIPError) {
          userMessage = 'API key rejected - check IP whitelist settings';
        } else if (err.isPassphraseError) {
          userMessage = 'Passphrase required - please reconnect with passphrase';
        }
        
        console.error(`[poll-balances] ${conn.exchange_name} error:`, userMessage);
        
        // Store error in database
        updatePromises.push(
          (async () => {
            await supabase
              .from('exchange_connections')
              .update({
                last_error: userMessage,
                last_error_at: new Date().toISOString(),
              })
              .eq('id', conn.id);
          })()
        );
      }
    }

    // Wait for all updates to complete
    await Promise.all(updatePromises);

    // Calculate total equity
    const totalEquity = balances.reduce((sum, b) => sum + b.totalUSDT, 0);

    // Always insert into balance_history for chart data
    const exchangeBreakdown = balances.map(b => ({
      exchange: b.exchange,
      balance: b.totalUSDT
    }));

    const { error: insertError } = await supabase.from('balance_history').insert({
      total_balance: totalEquity,
      exchange_breakdown: exchangeBreakdown,
      snapshot_time: new Date().toISOString()
    });

    if (insertError) {
      console.error('[poll-balances] Error inserting balance_history:', insertError);
    } else {
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
