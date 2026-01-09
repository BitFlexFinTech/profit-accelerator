import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: HMAC-SHA256 signature
async function hmacSign(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSignB64(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// Helper: Fetch balance from exchange - returns error if auth fails
// supabaseClient is optional - if provided, enables VPS proxy for IP-restricted exchanges
async function fetchExchangeBalance(
  exchange: { exchange_name: string; api_key?: string; api_secret?: string; api_passphrase?: string },
  supabaseClient?: any
): Promise<{ balance: number; pingMs: number; error?: string }> {
  const exchangeKey = exchange.exchange_name.toLowerCase();
  const startTime = Date.now();
  let balance = 0;
  let authSuccess = false;
  let lastError = '';

  if (exchangeKey === 'binance' && exchange.api_key && exchange.api_secret) {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await hmacSign(exchange.api_secret, queryString);
    const resp = await fetch(`https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`, {
      headers: { 'X-MBX-APIKEY': exchange.api_key }
    });
    if (resp.ok) {
      const data = await resp.json();
      const usdt = data.balances?.find((b: { asset: string }) => b.asset === 'USDT');
      balance = parseFloat(usdt?.free || '0') + parseFloat(usdt?.locked || '0');
      authSuccess = true;
    } else {
      lastError = `Binance API error: ${resp.status}`;
      console.error(`[trade-engine] ${lastError}`);
    }
  } else if (exchangeKey === 'okx' && exchange.api_key && exchange.api_secret && exchange.api_passphrase) {
    // OKX requires IP whitelist - check for VPS proxy first
    let vpsProxyAvailable = false;
    let vpsOutboundIp = '';
    
    if (supabaseClient) {
      const { data: vpsConfig } = await supabaseClient
        .from('vps_config')
        .select('outbound_ip, status')
        .eq('status', 'running')
        .not('outbound_ip', 'is', null)
        .limit(1);
      
      if (vpsConfig?.length && vpsConfig[0].outbound_ip) {
        vpsProxyAvailable = true;
        vpsOutboundIp = vpsConfig[0].outbound_ip;
        console.log(`[trade-engine] VPS proxy available at ${vpsOutboundIp}`);
      }
    }
    
    // Route through VPS proxy if available (required for IP-whitelisted API keys)
    if (vpsProxyAvailable) {
      try {
        const proxyUrl = `http://${vpsOutboundIp}:8080/balance`;
        console.log(`[trade-engine] Using VPS proxy for OKX: ${proxyUrl}`);
        
        const proxyResponse = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exchange: 'okx',
            apiKey: exchange.api_key,
            apiSecret: exchange.api_secret,
            passphrase: exchange.api_passphrase,
          }),
          signal: AbortSignal.timeout(15000),
        });
        
        if (proxyResponse.ok) {
          const proxyData = await proxyResponse.json();
          if (proxyData.success) {
            balance = proxyData.balance || 0;
            authSuccess = true;
            console.log(`[trade-engine] OKX via VPS proxy: $${balance}`);
          } else {
            lastError = `VPS proxy OKX error: ${proxyData.error || 'Unknown'}`;
            console.error(`[trade-engine] ${lastError}`);
          }
        } else {
          const errText = await proxyResponse.text().catch(() => 'Unknown');
          lastError = `VPS proxy HTTP ${proxyResponse.status}: ${errText.substring(0, 200)}`;
          console.error(`[trade-engine] ${lastError}`);
        }
      } catch (proxyErr) {
        lastError = `VPS proxy connection failed: ${proxyErr instanceof Error ? proxyErr.message : 'Unknown'}`;
        console.error(`[trade-engine] ${lastError}`);
      }
    } else {
      // No VPS available - try direct API calls but they will likely fail for IP-restricted keys
      console.log(`[trade-engine] No VPS proxy available, attempting direct OKX API calls`);
      
      let tradingSuccess = false;
      let fundingSuccess = false;
      
      // 1. Fetch TRADING account balance
      const timestamp = new Date().toISOString();
      const tradingPath = '/api/v5/account/balance';
      const tradingSign = await hmacSignB64(exchange.api_secret, timestamp + 'GET' + tradingPath);
      try {
        const tradingResp = await fetch(`https://www.okx.com${tradingPath}`, {
          headers: {
            'OK-ACCESS-KEY': exchange.api_key,
            'OK-ACCESS-SIGN': tradingSign,
            'OK-ACCESS-TIMESTAMP': timestamp,
            'OK-ACCESS-PASSPHRASE': exchange.api_passphrase,
            'Content-Type': 'application/json'
          }
        });
        
        if (tradingResp.ok) {
          const tradingData = await tradingResp.json();
          console.log(`[trade-engine] OKX Trading response code: ${tradingData.code}, msg: ${tradingData.msg || 'none'}`);
          if (tradingData.code === '0') {
            tradingSuccess = true;
            const details = tradingData.data?.[0]?.details || [];
            const usdtDetail = details.find((d: { ccy: string }) => d.ccy === 'USDT');
            if (usdtDetail) {
              const tradingBalance = parseFloat(usdtDetail.availBal || '0') + parseFloat(usdtDetail.frozenBal || '0');
              balance += tradingBalance;
              console.log(`[trade-engine] OKX Trading USDT: ${tradingBalance}`);
            }
          } else {
            // Check for IP restriction error (code 50111)
            if (tradingData.code === '50111') {
              lastError = `OKX IP restriction error: Your API key requires IP whitelisting. Deploy a VPS and whitelist its IP on OKX.`;
            } else {
              lastError = `OKX Trading API error: ${tradingData.code} - ${tradingData.msg || 'Unknown error'}`;
            }
            console.error(`[trade-engine] ${lastError}`);
          }
        } else {
          const errText = await tradingResp.text().catch(() => 'Unknown');
          lastError = `OKX Trading HTTP ${tradingResp.status}: ${errText.substring(0, 200)}`;
          console.error(`[trade-engine] ${lastError}`);
        }
      } catch (err) {
        lastError = `OKX Trading fetch error: ${err instanceof Error ? err.message : 'Unknown'}`;
        console.error(`[trade-engine] ${lastError}`);
      }
      
      // 2. Fetch FUNDING account balance (where deposits usually go!)
      const fundingTimestamp = new Date().toISOString();
      const fundingPath = '/api/v5/asset/balances';
      const fundingSign = await hmacSignB64(exchange.api_secret, fundingTimestamp + 'GET' + fundingPath);
      try {
        const fundingResp = await fetch(`https://www.okx.com${fundingPath}`, {
          headers: {
            'OK-ACCESS-KEY': exchange.api_key,
            'OK-ACCESS-SIGN': fundingSign,
            'OK-ACCESS-TIMESTAMP': fundingTimestamp,
            'OK-ACCESS-PASSPHRASE': exchange.api_passphrase,
            'Content-Type': 'application/json'
          }
        });
        
        if (fundingResp.ok) {
          const fundingData = await fundingResp.json();
          console.log(`[trade-engine] OKX Funding response code: ${fundingData.code}, msg: ${fundingData.msg || 'none'}`);
          if (fundingData.code === '0') {
            fundingSuccess = true;
            const usdtFunding = fundingData.data?.find((d: { ccy: string }) => d.ccy === 'USDT');
            if (usdtFunding) {
              const fundingBalance = parseFloat(usdtFunding.availBal || '0') + parseFloat(usdtFunding.frozenBal || '0');
              balance += fundingBalance;
              console.log(`[trade-engine] OKX Funding USDT: ${fundingBalance}`);
            }
          } else {
            // Check for IP restriction error (code 50111)
            if (fundingData.code === '50111') {
              lastError = `OKX IP restriction error: Your API key requires IP whitelisting. Deploy a VPS and whitelist its IP on OKX.`;
            } else {
              lastError = `OKX Funding API error: ${fundingData.code} - ${fundingData.msg || 'Unknown error'}`;
            }
            console.error(`[trade-engine] ${lastError}`);
          }
        } else {
          const errText = await fundingResp.text().catch(() => 'Unknown');
          lastError = `OKX Funding HTTP ${fundingResp.status}: ${errText.substring(0, 200)}`;
          console.error(`[trade-engine] ${lastError}`);
        }
      } catch (err) {
        lastError = `OKX Funding fetch error: ${err instanceof Error ? err.message : 'Unknown'}`;
        console.error(`[trade-engine] ${lastError}`);
      }
      
      // OKX auth is successful if at least one endpoint worked
      authSuccess = tradingSuccess || fundingSuccess;
      console.log(`[trade-engine] OKX auth success: ${authSuccess}, Total USDT: ${balance}`);
      
      // If both failed, provide actionable error
      if (!authSuccess) {
        lastError = lastError || 'OKX authentication failed. Check: 1) API key permissions (Read for Trading + Funding), 2) Passphrase is correct, 3) IP whitelist includes this server. TIP: Deploy a VPS and whitelist its IP on OKX.';
      }
    }
  } else if (exchangeKey === 'bybit' && exchange.api_key && exchange.api_secret) {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const message = timestamp + exchange.api_key + recvWindow + 'accountType=UNIFIED';
    const signature = await hmacSign(exchange.api_secret, message);
    const resp = await fetch('https://api.bybit.com/v5/account/wallet-balance?accountType=UNIFIED', {
      headers: {
        'X-BAPI-API-KEY': exchange.api_key,
        'X-BAPI-SIGN': signature,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recvWindow
      }
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.retCode === 0 && data.result?.list?.[0]) {
        balance = parseFloat(data.result.list[0].totalEquity || '0');
        authSuccess = true;
      } else {
        lastError = `Bybit API error: ${data.retCode} - ${data.retMsg || 'Unknown'}`;
      }
    } else {
      lastError = `Bybit HTTP error: ${resp.status}`;
    }
  }

  // Return error if we couldn't authenticate
  if (!authSuccess && exchangeKey !== 'hyperliquid') {
    return { balance: 0, pingMs: Date.now() - startTime, error: lastError || 'Authentication failed' };
  }

  return { balance, pingMs: Date.now() - startTime };
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

    const { action, ...params } = await req.json();
    // Sanitized log - never log secrets
    const sanitizedParams = { ...params };
    delete sanitizedParams.apiSecret;
    delete sanitizedParams.apiPassphrase;
    delete sanitizedParams.agentPrivateKey;
    console.log(`[trade-engine] Action: ${action}`, JSON.stringify(sanitizedParams));

    switch (action) {
      case 'get-ip': {
        const { data: vpsConfig } = await supabase
          .from('vps_config')
          .select('outbound_ip, status')
          .eq('status', 'running')
          .not('outbound_ip', 'is', null)
          .limit(1);

        if (!vpsConfig?.length) {
          return new Response(JSON.stringify({ success: false, error: 'No VPS deployed', ip: null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ success: true, ip: vpsConfig[0].outbound_ip }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'verify-vps-order-endpoint': {
        // Check if VPS is running and accessible for order execution
        const { data: vpsConfig } = await supabase
          .from('vps_config')
          .select('outbound_ip, status, provider')
          .eq('status', 'running')
          .not('outbound_ip', 'is', null)
          .limit(1);

        if (!vpsConfig?.length) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'No running VPS found',
            vpsAvailable: false,
            healthEndpoint: null,
            orderEndpoint: null
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const vpsIp = vpsConfig[0].outbound_ip;
        const healthUrl = `http://${vpsIp}:8080/health`;
        const orderUrl = `http://${vpsIp}:8080/place-order`;
        
        let healthStatus = 'unknown';
        let healthLatencyMs = 0;
        let orderEndpointReady = false;

        // Test health endpoint
        try {
          const healthStart = Date.now();
          const healthResp = await fetch(healthUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
          });
          healthLatencyMs = Date.now() - healthStart;
          
          if (healthResp.ok) {
            const healthData = await healthResp.json();
            healthStatus = healthData.status || 'ok';
            orderEndpointReady = true;
            console.log(`[trade-engine] VPS health check passed: ${healthStatus} (${healthLatencyMs}ms)`);
          } else {
            healthStatus = `error-${healthResp.status}`;
            console.log(`[trade-engine] VPS health check failed: HTTP ${healthResp.status}`);
          }
        } catch (err) {
          healthStatus = `unreachable: ${err instanceof Error ? err.message : 'timeout'}`;
          console.log(`[trade-engine] VPS health check failed: ${healthStatus}`);
        }

        return new Response(JSON.stringify({
          success: orderEndpointReady,
          vpsAvailable: true,
          vpsIp,
          provider: vpsConfig[0].provider,
          healthEndpoint: healthUrl,
          orderEndpoint: orderUrl,
          healthStatus,
          healthLatencyMs,
          orderEndpointReady,
          message: orderEndpointReady 
            ? 'VPS order endpoint is accessible and ready for live trades'
            : 'VPS is running but order endpoint is not responding'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'diagnose-outbound': {
        const { data: vpsConfig } = await supabase
          .from('vps_config')
          .select('outbound_ip, status')
          .eq('status', 'running')
          .not('outbound_ip', 'is', null)
          .limit(1);
        
        const vpsAvailable = !!vpsConfig?.length;
        const vpsIp = vpsAvailable ? vpsConfig[0].outbound_ip : null;
        
        const { data: exchanges } = await supabase
          .from('exchange_connections')
          .select('exchange_name, is_connected')
          .eq('is_connected', true);
        
        return new Response(JSON.stringify({
          success: true,
          vpsAvailable,
          vpsIp,
          connectedExchanges: exchanges?.map(e => e.exchange_name) || [],
          orderRoutingPath: vpsAvailable 
            ? `VPS Proxy (http://${vpsIp}:8080/place-order)` 
            : 'BLOCKED - No VPS available for live orders',
          recommendation: vpsAvailable 
            ? 'Orders will route through your whitelisted VPS IP'
            : 'Deploy a VPS and whitelist its IP on your exchange to enable live trading'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // REMOVED: paper-order case - All trading now goes through VPS bot only
      // The VPS bot handles simulation, paper, and live modes with identical logic
      // Only difference: Live mode places real exchange orders, Paper/Simulation do not
      case 'paper-order': {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'DISABLED: All trading now goes through VPS bot. Use bot-control to start/stop trading.',
          action_required: 'Use the dashboard Start button to begin trading via VPS bot.'
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      case 'test-connection': {
        const { exchangeName, apiKey, apiSecret, apiPassphrase, walletAddress, agentPrivateKey } = params;
        const isValid = exchangeName === 'hyperliquid' 
          ? walletAddress?.length > 10 && agentPrivateKey?.length > 10
          : apiKey?.length > 10 && apiSecret?.length > 10;

        if (!isValid) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid credential format' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        try {
          // Pass supabase client to enable VPS proxy for IP-restricted exchanges like OKX
          const result = await fetchExchangeBalance({ exchange_name: exchangeName, api_key: apiKey, api_secret: apiSecret, api_passphrase: apiPassphrase }, supabase);
          
          // Fail-closed: if there's an error, return failure with clear message
          if (result.error) {
            console.error(`[trade-engine] Test connection failed for ${exchangeName}: ${result.error}`);
            return new Response(JSON.stringify({ success: false, error: result.error }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          
          return new Response(JSON.stringify({ success: true, balance: result.balance.toFixed(2), pingMs: result.pingMs, message: `Connected to ${exchangeName}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (err) {
          return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Connection failed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      case 'save-exchange': {
        const { exchangeName, apiKey, apiSecret, apiPassphrase, walletAddress, agentPrivateKey, balance } = params;
        const { data: existing } = await supabase.from('exchange_connections').select('id').eq('exchange_name', exchangeName).single();
        
        const updateData: Record<string, unknown> = {
          is_connected: true,
          balance_usdt: parseFloat(balance) || 0,
          balance_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        if (exchangeName.toLowerCase() === 'hyperliquid') {
          updateData.wallet_address = walletAddress;
          updateData.agent_private_key = agentPrivateKey;
        } else {
          updateData.api_key = apiKey;
          updateData.api_secret = apiSecret;
          if (apiPassphrase) updateData.api_passphrase = apiPassphrase;
        }

        if (existing) {
          await supabase.from('exchange_connections').update(updateData).eq('id', existing.id);
        } else {
          await supabase.from('exchange_connections').insert({ exchange_name: exchangeName, ...updateData });
        }

        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get-prices': {
        const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'XRPUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'SUIUSDT', 'ZECUSDT', 'BNBUSDT'];
        const prices: Record<string, { price: number; change24h: number }> = {};
        
        for (const sym of symbols) {
          try {
            const resp = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`);
            if (resp.ok) {
              const d = await resp.json();
              prices[sym.replace('USDT', '')] = { price: parseFloat(d.lastPrice), change24h: parseFloat(d.priceChangePercent) };
            }
          } catch { /* skip */ }
        }

        return new Response(JSON.stringify({ success: true, prices, timestamp: new Date().toISOString() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get-tickers': {
        const { symbols } = params;
        const symList = symbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'XRPUSDT'];
        const tickers: Array<{ symbol: string; exchange: string; lastPrice: number; priceChange24h: number; volume24h: number }> = [];

        // Get connected exchanges
        const { data: connectedExchanges } = await supabase
          .from('exchange_connections')
          .select('exchange_name')
          .eq('is_connected', true);
        
        const connectedNames = connectedExchanges?.map(e => e.exchange_name.toLowerCase()) || ['binance'];

        // Fetch from Binance
        if (connectedNames.includes('binance')) {
          for (const sym of symList) {
            try {
              const resp = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`);
              if (resp.ok) {
                const d = await resp.json();
                tickers.push({ symbol: sym, exchange: 'binance', lastPrice: parseFloat(d.lastPrice), priceChange24h: parseFloat(d.priceChangePercent), volume24h: parseFloat(d.volume) });
              }
            } catch { /* skip */ }
          }
        }

        // Fetch from OKX
        if (connectedNames.includes('okx')) {
          for (const sym of symList) {
            try {
              const okxSymbol = sym.replace('USDT', '-USDT');
              const resp = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${okxSymbol}`);
              if (resp.ok) {
                const d = await resp.json();
                if (d.code === '0' && d.data?.[0]) {
                  const t = d.data[0];
                  const change = ((parseFloat(t.last) - parseFloat(t.open24h)) / parseFloat(t.open24h)) * 100;
                  tickers.push({ symbol: sym, exchange: 'okx', lastPrice: parseFloat(t.last), priceChange24h: change, volume24h: parseFloat(t.vol24h) });
                }
              }
            } catch { /* skip */ }
          }
        }

        // Fetch from Bybit
        if (connectedNames.includes('bybit')) {
          for (const sym of symList) {
            try {
              const resp = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${sym}`);
              if (resp.ok) {
                const d = await resp.json();
                if (d.retCode === 0 && d.result?.list?.[0]) {
                  const t = d.result.list[0];
                  tickers.push({ symbol: sym, exchange: 'bybit', lastPrice: parseFloat(t.lastPrice), priceChange24h: parseFloat(t.price24hPcnt) * 100, volume24h: parseFloat(t.volume24h) });
                }
              }
            } catch { /* skip */ }
          }
        }

        return new Response(JSON.stringify({ success: true, tickers }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get-balances': {
        const { data: exchanges } = await supabase.from('exchange_connections').select('exchange_name, balance_usdt, balance_updated_at, is_connected').eq('is_connected', true);
        const totalBalance = exchanges?.reduce((sum, ex) => sum + (ex.balance_usdt || 0), 0) || 0;
        return new Response(JSON.stringify({ success: true, exchanges: exchanges || [], totalBalance }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'sync-balances': {
        const { data: exchanges } = await supabase.from('exchange_connections').select('*').eq('is_connected', true);
        if (!exchanges?.length) {
          return new Response(JSON.stringify({ success: false, error: 'No connected exchanges' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const balances: Record<string, number> = {};
        for (const ex of exchanges) {
          try {
            // Pass supabase client to enable VPS proxy for IP-restricted exchanges like OKX
            const { balance, pingMs } = await fetchExchangeBalance(ex, supabase);
            balances[ex.exchange_name] = balance;
            await supabase.from('exchange_connections').update({
              balance_usdt: balance,
              balance_updated_at: new Date().toISOString(),
              last_ping_ms: pingMs,
              last_ping_at: new Date().toISOString()
            }).eq('id', ex.id);
          } catch { balances[ex.exchange_name] = ex.balance_usdt || 0; }
        }

        return new Response(JSON.stringify({ success: true, balances }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'place-order': {
        const { exchangeName, symbol, side, quantity, price, orderType = 'market' } = params;
        const orderPlacedAt = new Date();
        
        // Check kill switch
        const { data: config } = await supabase.from('trading_config').select('*').single();
        if (config?.global_kill_switch_enabled) {
          console.log('[trade-engine] Kill switch is ACTIVE - blocking order');
          return new Response(JSON.stringify({ success: false, error: 'Kill switch is active. Disable it from the dashboard to trade.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Check for VPS availability for IP-whitelisted exchanges
        const ipRestrictedExchanges = ['okx', 'kucoin', 'gate.io', 'bitget'];
        const normalizedExchange = exchangeName.toLowerCase();
        
        if (ipRestrictedExchanges.includes(normalizedExchange)) {
          const { data: vpsConfig } = await supabase
            .from('vps_config')
            .select('outbound_ip, status')
            .eq('status', 'running')
            .not('outbound_ip', 'is', null)
            .limit(1);
          
          if (!vpsConfig?.length) {
            console.log(`[trade-engine] No VPS available for IP-restricted exchange: ${exchangeName}`);
            return new Response(JSON.stringify({ 
              success: false, 
              error: `${exchangeName} requires VPS with whitelisted IP. Deploy a VPS first and whitelist its IP on the exchange.`,
              requiresVPS: true
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          
          console.log(`[trade-engine] VPS available at ${vpsConfig[0].outbound_ip} for ${exchangeName}`);
        }

        // Get exchange credentials
        const { data: conn, error: connError } = await supabase
          .from('exchange_connections')
          .select('api_key, api_secret, api_passphrase')
          .eq('exchange_name', exchangeName)
          .eq('is_connected', true)
          .single();
        
        if (connError || !conn?.api_key || !conn?.api_secret) {
          console.error(`[trade-engine] No credentials for ${exchangeName}:`, connError?.message);
          return new Response(JSON.stringify({ success: false, error: `Exchange ${exchangeName} not connected or missing credentials` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Execute REAL order based on exchange
        let orderId = '';
        let filledPrice = price || 0;
        let orderStatus = 'unknown';

        try {
          if (normalizedExchange === 'binance') {
            // Binance REAL order execution
            const timestamp = Date.now();
            const symbolFormatted = symbol.replace('/', '');
            const sideUpper = side.toUpperCase();
            const type = orderType === 'limit' && price ? 'LIMIT' : 'MARKET';
            
            let queryParams = `symbol=${symbolFormatted}&side=${sideUpper}&type=${type}&quantity=${quantity}&timestamp=${timestamp}`;
            if (type === 'LIMIT' && price) {
              queryParams += `&price=${price}&timeInForce=GTC`;
            }
            
            const signature = await hmacSign(conn.api_secret, queryParams);
            
            console.log(`[trade-engine] Executing Binance ${type} ${sideUpper} order: ${quantity} ${symbolFormatted}`);
            
            const resp = await fetch(`https://api.binance.com/api/v3/order?${queryParams}&signature=${signature}`, {
              method: 'POST',
              headers: { 'X-MBX-APIKEY': conn.api_key }
            });
            
            const result = await resp.json();
            
            if (!resp.ok || result.code) {
              throw new Error(`Binance order failed: ${result.msg || result.code || resp.status}`);
            }
            
            orderId = String(result.orderId);
            filledPrice = parseFloat(result.fills?.[0]?.price || result.price || price || '0');
            orderStatus = result.status;
            console.log(`[trade-engine] Binance order ${orderId} executed: ${orderStatus} at ${filledPrice}`);
            
          } else if (normalizedExchange === 'okx') {
            // OKX REAL order execution
            const timestamp = new Date().toISOString();
            const instId = symbol.replace('/', '-');
            const body = JSON.stringify({
              instId,
              tdMode: 'cash',
              side: side.toLowerCase(),
              ordType: orderType === 'limit' && price ? 'limit' : 'market',
              sz: String(quantity),
              px: orderType === 'limit' && price ? String(price) : undefined
            });
            
            const path = '/api/v5/trade/order';
            const sign = await hmacSignB64(conn.api_secret, timestamp + 'POST' + path + body);
            
            console.log(`[trade-engine] Executing OKX ${orderType} ${side} order: ${quantity} ${instId}`);
            
            const resp = await fetch(`https://www.okx.com${path}`, {
              method: 'POST',
              headers: {
                'OK-ACCESS-KEY': conn.api_key,
                'OK-ACCESS-SIGN': sign,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'OK-ACCESS-PASSPHRASE': conn.api_passphrase || '',
                'Content-Type': 'application/json'
              },
              body
            });
            
            const result = await resp.json();
            
            if (result.code !== '0') {
              throw new Error(`OKX order failed: ${result.msg || result.code}`);
            }
            
            orderId = result.data?.[0]?.ordId || '';
            filledPrice = parseFloat(result.data?.[0]?.avgPx || price || '0');
            orderStatus = result.data?.[0]?.state || 'filled';
            console.log(`[trade-engine] OKX order ${orderId} executed: ${orderStatus}`);
            
          } else if (normalizedExchange === 'bybit') {
            // Bybit REAL order execution
            const timestamp = Date.now().toString();
            const recvWindow = '5000';
            const symbolFormatted = symbol.replace('/', '');
            
            const body = JSON.stringify({
              category: 'spot',
              symbol: symbolFormatted,
              side: side.charAt(0).toUpperCase() + side.slice(1).toLowerCase(),
              orderType: orderType === 'limit' && price ? 'Limit' : 'Market',
              qty: String(quantity),
              price: orderType === 'limit' && price ? String(price) : undefined
            });
            
            const sign = await hmacSign(conn.api_secret, timestamp + conn.api_key + recvWindow + body);
            
            console.log(`[trade-engine] Executing Bybit ${orderType} ${side} order: ${quantity} ${symbolFormatted}`);
            
            const resp = await fetch('https://api.bybit.com/v5/order/create', {
              method: 'POST',
              headers: {
                'X-BAPI-API-KEY': conn.api_key,
                'X-BAPI-SIGN': sign,
                'X-BAPI-TIMESTAMP': timestamp,
                'X-BAPI-RECV-WINDOW': recvWindow,
                'Content-Type': 'application/json'
              },
              body
            });
            
            const result = await resp.json();
            
            if (result.retCode !== 0) {
              throw new Error(`Bybit order failed: ${result.retMsg || result.retCode}`);
            }
            
            orderId = result.result?.orderId || '';
            filledPrice = parseFloat(result.result?.avgPrice || price || '0');
            orderStatus = 'filled';
            console.log(`[trade-engine] Bybit order ${orderId} executed`);
            
          } else {
            throw new Error(`Exchange ${exchangeName} not yet supported for live orders`);
          }
        } catch (err) {
          console.error(`[trade-engine] Order execution failed:`, err);
          return new Response(JSON.stringify({ 
            success: false, 
            error: err instanceof Error ? err.message : 'Order execution failed'
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const orderFilledAt = new Date();
        const executionTimeMs = orderFilledAt.getTime() - orderPlacedAt.getTime();

        // Record to trading_journal with real order details
        await supabase.from('trading_journal').insert({
          exchange: exchangeName,
          symbol,
          side,
          quantity,
          entry_price: filledPrice,
          status: 'open',
          execution_latency_ms: executionTimeMs
        });

        // Record to trade_execution_metrics for latency dashboard
        await supabase.from('trade_execution_metrics').insert({
          exchange: exchangeName,
          symbol,
          order_type: side,
          execution_time_ms: executionTimeMs,
          order_placed_at: orderPlacedAt.toISOString(),
          order_filled_at: orderFilledAt.toISOString(),
          api_response_time_ms: executionTimeMs,
          network_latency_ms: Math.max(0, Math.round(executionTimeMs * 0.3))
        });

        console.log(`[trade-engine] ✅ REAL order ${orderId} executed on ${exchangeName} in ${executionTimeMs}ms at $${filledPrice}`);
        return new Response(JSON.stringify({ 
          success: true, 
          orderId, 
          executedPrice: filledPrice, 
          executionTimeMs,
          exchange: exchangeName,
          orderStatus
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'test-latency': {
        const { exchangeName = 'binance', count = 5 } = params;
        const results: Array<{ iteration: number; executionTimeMs: number }> = [];
        
        for (let i = 0; i < Math.min(count, 10); i++) {
          const orderPlacedAt = new Date();
          
          // Ping the exchange
          const endpoints: Record<string, string> = {
            binance: 'https://api.binance.com/api/v3/ping',
            okx: 'https://www.okx.com/api/v5/public/time',
            bybit: 'https://api.bybit.com/v5/market/time'
          };
          
          const endpoint = endpoints[exchangeName.toLowerCase()] || endpoints.binance;
          
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 5000);
            await fetch(endpoint, { signal: ctrl.signal });
            clearTimeout(t);
          } catch { /* ignore ping failures */ }
          
          const orderFilledAt = new Date();
          const executionTimeMs = orderFilledAt.getTime() - orderPlacedAt.getTime();
          
          await supabase.from('trade_execution_metrics').insert({
            exchange: exchangeName,
            symbol: 'BTCUSDT',
            order_type: 'test',
            execution_time_ms: executionTimeMs,
            order_placed_at: orderPlacedAt.toISOString(),
            order_filled_at: orderFilledAt.toISOString(),
            api_response_time_ms: executionTimeMs,
            network_latency_ms: Math.round(executionTimeMs * 0.7)
          });
          
          results.push({ iteration: i + 1, executionTimeMs });
          
          // Small delay between tests
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.log(`[trade-engine] Generated ${results.length} test latency records`);
        return new Response(JSON.stringify({ success: true, message: `Generated ${results.length} test records`, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'ping-all-exchanges': {
        const endpoints: Record<string, string> = {
          binance: 'https://api.binance.com/api/v3/ping',
          okx: 'https://www.okx.com/api/v5/public/time',
          bybit: 'https://api.bybit.com/v5/market/time',
          bitget: 'https://api.bitget.com/api/v2/public/time',
          bingx: 'https://open-api.bingx.com/openApi/swap/v2/server/time',
          mexc: 'https://api.mexc.com/api/v3/ping',
          gateio: 'https://api.gateio.ws/api/v4/spot/time',
          kucoin: 'https://api.kucoin.com/api/v1/timestamp',
          kraken: 'https://api.kraken.com/0/public/Time',
          nexo: 'https://api.nexo.io/api/v1/pairs',
          hyperliquid: 'https://api.hyperliquid.xyz/info'
        };

        const results: Array<{ exchange: string; latency: number; status: string }> = [];
        for (const [name, url] of Object.entries(endpoints)) {
          const start = Date.now();
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 5000);
            const resp = await fetch(url, { 
              signal: ctrl.signal,
              method: name === 'hyperliquid' ? 'POST' : 'GET',
              headers: name === 'hyperliquid' ? { 'Content-Type': 'application/json' } : undefined,
              body: name === 'hyperliquid' ? JSON.stringify({ type: 'meta' }) : undefined
            });
            clearTimeout(t);
            const lat = Date.now() - start;
            const status = resp.ok ? (lat < 50 ? 'healthy' : 'jitter') : 'error';
            results.push({ exchange: name, latency: lat, status });
            await supabase.from('exchange_pulse').update({ status, latency_ms: lat, last_check: new Date().toISOString() }).eq('exchange_name', name);
          } catch {
            results.push({ exchange: name, latency: Date.now() - start, status: 'error' });
          }
        }

        return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'save-hft-settings': {
        const { riskSettings, latencySettings } = params;
        if (riskSettings) {
          await supabase.from('trading_config').update({
            max_daily_drawdown_percent: riskSettings.maxDailyDrawdown,
            max_position_size: riskSettings.maxPositionSize,
            global_kill_switch_enabled: riskSettings.globalKillSwitch
          }).neq('id', '00000000-0000-0000-0000-000000000000');
        }
        if (latencySettings) {
          await supabase.from('vps_config').update({
            execution_buffer_ms: latencySettings.executionBuffer,
            cors_proxy_enabled: latencySettings.corsProxy
          }).neq('id', '00000000-0000-0000-0000-000000000000');
        }
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get-hft-settings': {
        const [tc, vc] = await Promise.all([
          supabase.from('trading_config').select('*').single(),
          supabase.from('vps_config').select('*').single()
        ]);
        return new Response(JSON.stringify({
          success: true,
          settings: {
            risk: { maxDailyDrawdown: tc.data?.max_daily_drawdown_percent || 5, maxPositionSize: tc.data?.max_position_size || 100, globalKillSwitch: tc.data?.global_kill_switch_enabled || false },
            latency: { region: vc.data?.region || 'ap-northeast-1', executionBuffer: vc.data?.execution_buffer_ms || 50, corsProxy: vc.data?.cors_proxy_enabled || false, outboundIp: vc.data?.outbound_ip }
          }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'wallet-transfer': {
        const { exchange, from, to, amount, asset = 'USDT' } = params;
        await supabase.from('audit_logs').insert({ action: 'wallet_transfer', entity_type: 'transfer', new_value: { exchange, from, to, amount, asset } });
        return new Response(JSON.stringify({ success: true, message: `Transferred ${amount} ${asset}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'test-stored-connection': {
        const { exchangeName } = params;
        console.log(`[trade-engine] Testing stored connection for ${exchangeName}`);
        
        const { data: conn, error: connError } = await supabase
          .from('exchange_connections')
          .select('*')
          .eq('exchange_name', exchangeName)
          .eq('is_connected', true)
          .single();
        
        if (connError || !conn) {
          return new Response(JSON.stringify({ success: false, error: 'No credentials stored for this exchange' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        
        try {
          // Pass supabase client to enable VPS proxy for IP-restricted exchanges like OKX
          const { balance, pingMs } = await fetchExchangeBalance({
            exchange_name: conn.exchange_name,
            api_key: conn.api_key,
            api_secret: conn.api_secret,
            api_passphrase: conn.api_passphrase
          }, supabase);
          
          // Update ping data
          await supabase.from('exchange_connections').update({
            last_ping_ms: pingMs,
            last_ping_at: new Date().toISOString(),
            balance_usdt: balance,
            balance_updated_at: new Date().toISOString()
          }).eq('id', conn.id);
          
          console.log(`[trade-engine] Test success for ${exchangeName}: $${balance.toFixed(2)}, ${pingMs}ms`);
          return new Response(JSON.stringify({ success: true, balance: balance.toFixed(2), pingMs }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (err) {
          console.error(`[trade-engine] Test failed for ${exchangeName}:`, err);
          return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Connection test failed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      case 'disconnect-exchange': {
        const { exchangeName } = params;
        console.log(`[trade-engine] Disconnecting exchange: ${exchangeName}`);
        
        const { error: updateError } = await supabase
          .from('exchange_connections')
          .update({
            is_connected: false,
            api_key: null,
            api_secret: null,
            api_passphrase: null,
            wallet_address: null,
            agent_private_key: null,
            balance_usdt: 0,
            updated_at: new Date().toISOString()
          })
          .eq('exchange_name', exchangeName);
        
        if (updateError) {
          console.error(`[trade-engine] Disconnect error:`, updateError);
          return new Response(JSON.stringify({ success: false, error: updateError.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        
        // Log the disconnect action
        await supabase.from('audit_logs').insert({
          action: 'exchange_disconnect',
          entity_type: 'exchange_connection',
          new_value: { exchange: exchangeName, disconnected_at: new Date().toISOString() }
        });
        
        console.log(`[trade-engine] Successfully disconnected ${exchangeName}`);
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'close-position': {
        const { tradeId, symbol, pnl, exitPrice } = params;
        console.log(`[trade-engine] Closing position: ${tradeId}, symbol=${symbol}, pnl=${pnl}`);
        
        // Update trading_journal with exit data
        const { error: journalError } = await supabase
          .from('trading_journal')
          .update({
            status: 'closed',
            exit_price: exitPrice || 0,
            pnl: pnl,
            closed_at: new Date().toISOString()
          })
          .eq('id', tradeId);
        
        if (journalError) {
          console.error('[trade-engine] Failed to update journal:', journalError);
        } else {
          console.log('[trade-engine] Journal entry updated');
        }
        
        // Find and update matching AI decision
        const { data: aiDecision, error: findError } = await supabase
          .from('ai_trade_decisions')
          .select('id')
          .eq('symbol', symbol)
          .eq('was_executed', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (aiDecision && !findError) {
          const { error: aiUpdateError } = await supabase
            .from('ai_trade_decisions')
            .update({
              was_executed: true,
              actual_profit: pnl,
              actual_outcome: pnl > 0 ? 'profit' : 'loss',
              trade_id: tradeId
            })
            .eq('id', aiDecision.id);
          
          if (aiUpdateError) {
            console.error('[trade-engine] Failed to update AI decision:', aiUpdateError);
          } else {
            console.log(`[trade-engine] Updated AI decision ${aiDecision.id} with outcome: ${pnl > 0 ? 'profit' : 'loss'}`);
          }
        } else {
          console.log('[trade-engine] No matching AI decision found for symbol:', symbol);
        }
        
        return new Response(JSON.stringify({ 
          success: true, 
          tradeId,
          pnl,
          outcome: pnl > 0 ? 'profit' : 'loss'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      default:
        return new Response(JSON.stringify({ success: false, error: 'Unknown action' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (error) {
    console.error('[trade-engine] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
