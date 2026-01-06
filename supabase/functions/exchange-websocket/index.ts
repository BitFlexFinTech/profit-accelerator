import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Throttle writes to 500ms
let lastWriteTime = 0;
const THROTTLE_MS = 500;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  // If not a WebSocket request, handle as HTTP trigger to start balance polling
  if (upgradeHeader.toLowerCase() !== "websocket") {
    console.log('[exchange-websocket] HTTP trigger - starting balance sync');
    
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      // Fetch current exchange connections
      const { data: exchanges, error: fetchError } = await supabase
        .from('exchange_connections')
        .select('*')
        .eq('is_connected', true);
      
      if (fetchError) {
        console.error('[exchange-websocket] Error fetching exchanges:', fetchError);
        return new Response(JSON.stringify({ error: fetchError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`[exchange-websocket] Found ${exchanges?.length || 0} connected exchanges`);

      // For each connected exchange, fetch real balance via REST API
      const balanceUpdates = [];
      
      for (const exchange of exchanges || []) {
        try {
          let balance = 0;
          const exchangeName = exchange.exchange_name?.toLowerCase();
          
          console.log(`[exchange-websocket] Fetching balance for ${exchangeName}...`);
          
          if (exchangeName === 'binance' && exchange.api_key && exchange.api_secret) {
            // Binance REST API balance fetch
            balance = await fetchBinanceBalance(exchange.api_key, exchange.api_secret);
          } else if (exchangeName === 'okx' && exchange.api_key && exchange.api_secret) {
            // OKX REST API balance fetch
            balance = await fetchOKXBalance(exchange.api_key, exchange.api_secret, exchange.api_passphrase);
          } else {
            // Keep existing balance for other exchanges
            balance = exchange.balance_usdt || 0;
          }

          console.log(`[exchange-websocket] ${exchangeName} balance: $${balance}`);
          
          balanceUpdates.push({
            id: exchange.id,
            balance_usdt: balance,
            balance_updated_at: new Date().toISOString(),
            last_ping_at: new Date().toISOString()
          });
        } catch (err) {
          console.error(`[exchange-websocket] Error fetching ${exchange.exchange_name} balance:`, err);
        }
      }

      // Apply throttled write
      const now = Date.now();
      if (now - lastWriteTime >= THROTTLE_MS) {
        lastWriteTime = now;
        
        // Update all balances
        for (const update of balanceUpdates) {
          const { error: updateError } = await supabase
            .from('exchange_connections')
            .update({
              balance_usdt: update.balance_usdt,
              balance_updated_at: update.balance_updated_at,
              last_ping_at: update.last_ping_at
            })
            .eq('id', update.id);
          
          if (updateError) {
            console.error(`[exchange-websocket] Update error for ${update.id}:`, updateError);
          }
        }
        
        console.log(`[exchange-websocket] Updated ${balanceUpdates.length} exchange balances`);
      }

      const totalBalance = balanceUpdates.reduce((sum, u) => sum + (u.balance_usdt || 0), 0);

      return new Response(JSON.stringify({
        success: true,
        exchanges: balanceUpdates.length,
        totalBalance,
        updatedAt: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
      
    } catch (err) {
      console.error('[exchange-websocket] Error:', err);
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // WebSocket upgrade for real-time streaming
  console.log('[exchange-websocket] WebSocket connection requested');
  
  const { socket, response } = Deno.upgradeWebSocket(req);
  
  socket.onopen = () => {
    console.log('[exchange-websocket] WebSocket connected');
    socket.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
  };
  
  socket.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log('[exchange-websocket] Received:', message);
      
      if (message.type === 'subscribe') {
        // Start streaming balance updates
        socket.send(JSON.stringify({ type: 'subscribed', exchanges: message.exchanges || [] }));
      }
    } catch (err) {
      console.error('[exchange-websocket] Message parse error:', err);
    }
  };
  
  socket.onclose = () => {
    console.log('[exchange-websocket] WebSocket closed');
  };
  
  socket.onerror = (err) => {
    console.error('[exchange-websocket] WebSocket error:', err);
  };
  
  return response;
});

// Binance balance fetching (all wallets: Spot + Funding + Futures)
async function fetchBinanceBalance(apiKey: string, apiSecret: string): Promise<number> {
  try {
    const timestamp = Date.now();
    
    // Fetch Spot balance
    const spotQuery = `timestamp=${timestamp}`;
    const spotSignature = await signHmacSha256(spotQuery, apiSecret);
    
    const spotResponse = await fetch(
      `https://api.binance.com/api/v3/account?${spotQuery}&signature=${spotSignature}`,
      { headers: { 'X-MBX-APIKEY': apiKey } }
    );
    
    let totalBalance = 0;
    
    if (spotResponse.ok) {
      const spotData = await spotResponse.json();
      const usdtSpot = spotData.balances?.find((b: any) => b.asset === 'USDT');
      totalBalance += parseFloat(usdtSpot?.free || 0) + parseFloat(usdtSpot?.locked || 0);
      console.log(`[Binance] Spot USDT: ${totalBalance}`);
    }
    
    // Fetch Futures balance (USD-M)
    const futuresQuery = `timestamp=${timestamp}`;
    const futuresSignature = await signHmacSha256(futuresQuery, apiSecret);
    
    const futuresResponse = await fetch(
      `https://fapi.binance.com/fapi/v2/balance?${futuresQuery}&signature=${futuresSignature}`,
      { headers: { 'X-MBX-APIKEY': apiKey } }
    );
    
    if (futuresResponse.ok) {
      const futuresData = await futuresResponse.json();
      const usdtFutures = futuresData.find((b: any) => b.asset === 'USDT');
      const futuresBalance = parseFloat(usdtFutures?.balance || 0);
      totalBalance += futuresBalance;
      console.log(`[Binance] Futures USDT: ${futuresBalance}`);
    }
    
    // Fetch Funding wallet
    const fundingQuery = `timestamp=${timestamp}&asset=USDT`;
    const fundingSignature = await signHmacSha256(fundingQuery, apiSecret);
    
    const fundingResponse = await fetch(
      `https://api.binance.com/sapi/v1/asset/get-funding-asset?${fundingQuery}&signature=${fundingSignature}`,
      { 
        method: 'POST',
        headers: { 'X-MBX-APIKEY': apiKey } 
      }
    );
    
    if (fundingResponse.ok) {
      const fundingData = await fundingResponse.json();
      const fundingBalance = fundingData.reduce((sum: number, a: any) => 
        sum + parseFloat(a.free || 0) + parseFloat(a.locked || 0), 0);
      totalBalance += fundingBalance;
      console.log(`[Binance] Funding USDT: ${fundingBalance}`);
    }
    
    return totalBalance;
  } catch (err) {
    console.error('[fetchBinanceBalance] Error:', err);
    return 0;
  }
}

// OKX balance fetching (Unified Account: Trading + Funding)
async function fetchOKXBalance(apiKey: string, apiSecret: string, passphrase?: string | null): Promise<number> {
  try {
    const timestamp = new Date().toISOString();
    
    // Trading account balance
    const tradingPath = '/api/v5/account/balance';
    const tradingSign = await signOKX(timestamp, 'GET', tradingPath, '', apiSecret);
    
    const tradingResponse = await fetch(`https://www.okx.com${tradingPath}`, {
      headers: {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': tradingSign,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': passphrase || '',
        'Content-Type': 'application/json'
      }
    });
    
    let totalBalance = 0;
    
    if (tradingResponse.ok) {
      const tradingData = await tradingResponse.json();
      const details = tradingData.data?.[0]?.details || [];
      const usdtTrading = details.find((d: any) => d.ccy === 'USDT');
      const tradingBal = parseFloat(usdtTrading?.availBal || 0) + parseFloat(usdtTrading?.frozenBal || 0);
      totalBalance += tradingBal;
      console.log(`[OKX] Trading USDT: ${tradingBal}`);
    }
    
    // Funding account balance
    const fundingPath = '/api/v5/asset/balances';
    const fundingSign = await signOKX(timestamp, 'GET', fundingPath, '', apiSecret);
    
    const fundingResponse = await fetch(`https://www.okx.com${fundingPath}`, {
      headers: {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': fundingSign,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': passphrase || '',
        'Content-Type': 'application/json'
      }
    });
    
    if (fundingResponse.ok) {
      const fundingData = await fundingResponse.json();
      const usdtFunding = fundingData.data?.find((d: any) => d.ccy === 'USDT');
      const fundingBal = parseFloat(usdtFunding?.availBal || 0) + parseFloat(usdtFunding?.frozenBal || 0);
      totalBalance += fundingBal;
      console.log(`[OKX] Funding USDT: ${fundingBal}`);
    }
    
    return totalBalance;
  } catch (err) {
    console.error('[fetchOKXBalance] Error:', err);
    return 0;
  }
}

// HMAC-SHA256 signing for Binance
async function signHmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// OKX signature
async function signOKX(timestamp: string, method: string, path: string, body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const message = timestamp + method + path + body;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
