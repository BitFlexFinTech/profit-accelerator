import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// The health.js code that includes /ping-exchanges endpoint
const HEALTH_JS_CODE = `const http = require('http');
const https = require('https');
const crypto = require('crypto');
const os = require('os');

const startTime = Date.now();

const getMetrics = () => ({
  status: 'ok',
  timestamp: Date.now(),
  uptime: Math.floor((Date.now() - startTime) / 1000),
  memory: {
    total: os.totalmem(),
    free: os.freemem(),
    used: os.totalmem() - os.freemem(),
    percent: Math.round((1 - os.freemem() / os.totalmem()) * 100)
  },
  cpu: os.loadavg(),
  hostname: os.hostname(),
  platform: os.platform(),
  version: '1.1.0'
});

const signBinance = (query, secret) => {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
};

const signOKX = (timestamp, method, path, body, secret) => {
  const message = timestamp + method + path + body;
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
};

const fetchBinanceBalance = async (apiKey, apiSecret) => {
  return new Promise((resolve) => {
    const timestamp = Date.now();
    const query = \\\`timestamp=\\\${timestamp}\\\`;
    const signature = signBinance(query, apiSecret);
    
    const options = {
      hostname: 'api.binance.com',
      path: \\\`/api/v3/account?\\\${query}&signature=\\\${signature}\\\`,
      method: 'GET',
      headers: { 'X-MBX-APIKEY': apiKey }
    };
    
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const usdt = json.balances?.find(b => b.asset === 'USDT');
          resolve(parseFloat(usdt?.free || 0) + parseFloat(usdt?.locked || 0));
        } catch { resolve(0); }
      });
    }).on('error', () => resolve(0));
  });
};

const fetchOKXBalance = async (apiKey, apiSecret, passphrase) => {
  let tradingBalance = 0;
  let fundingBalance = 0;
  let lastError = null;
  let authSuccess = false;
  
  try {
    const tradingResult = await new Promise((resolve, reject) => {
      const timestamp = new Date().toISOString();
      const path = '/api/v5/account/balance';
      const sign = signOKX(timestamp, 'GET', path, '', apiSecret);
      
      const req = https.get({
        hostname: 'www.okx.com',
        path,
        headers: {
          'OK-ACCESS-KEY': apiKey,
          'OK-ACCESS-SIGN': sign,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-PASSPHRASE': passphrase || '',
          'Content-Type': 'application/json'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
    
    const json = JSON.parse(tradingResult.body);
    if (json.code === '0') {
      authSuccess = true;
      const details = json.data?.[0]?.details || [];
      const usdt = details.find(d => d.ccy === 'USDT');
      tradingBalance = parseFloat(usdt?.availBal || 0) + parseFloat(usdt?.frozenBal || 0);
    } else {
      lastError = 'OKX error ' + json.code + ': ' + (json.msg || 'Unknown');
    }
  } catch (err) {
    lastError = 'OKX Trading request failed: ' + err.message;
  }
  
  try {
    const fundingResult = await new Promise((resolve, reject) => {
      const timestamp = new Date().toISOString();
      const path = '/api/v5/asset/balances';
      const sign = signOKX(timestamp, 'GET', path, '', apiSecret);
      
      const req = https.get({
        hostname: 'www.okx.com',
        path,
        headers: {
          'OK-ACCESS-KEY': apiKey,
          'OK-ACCESS-SIGN': sign,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-PASSPHRASE': passphrase || '',
          'Content-Type': 'application/json'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
    
    const json = JSON.parse(fundingResult.body);
    if (json.code === '0') {
      authSuccess = true;
      const usdt = json.data?.find(d => d.ccy === 'USDT');
      fundingBalance = parseFloat(usdt?.availBal || 0) + parseFloat(usdt?.frozenBal || 0);
    } else if (!lastError) {
      lastError = 'OKX Funding error ' + json.code + ': ' + (json.msg || 'Unknown');
    }
  } catch (err) {
    if (!lastError) lastError = 'OKX Funding request failed: ' + err.message;
  }
  
  const totalBalance = tradingBalance + fundingBalance;
  
  if (!authSuccess) {
    return { success: false, balance: 0, error: lastError || 'OKX authentication failed' };
  }
  
  return { success: true, balance: totalBalance };
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200);
    res.end(JSON.stringify(getMetrics()));
  } else if (req.url === '/metrics') {
    res.writeHead(200);
    res.end(JSON.stringify({
      ...getMetrics(),
      detailed: true,
      network: os.networkInterfaces()
    }));
  } else if (req.url === '/balance' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { exchange, apiKey, apiSecret, passphrase } = JSON.parse(body);
        console.log('[Balance Proxy] Request for:', exchange);
        
        if (exchange === 'binance') {
          const balance = await fetchBinanceBalance(apiKey, apiSecret);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, balance, exchange }));
        } else if (exchange === 'okx') {
          const result = await fetchOKXBalance(apiKey, apiSecret, passphrase);
          res.writeHead(200);
          res.end(JSON.stringify({ ...result, exchange }));
        } else {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Unsupported exchange: ' + exchange }));
        }
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: String(err) }));
      }
    });
  } else if (req.url === '/ping-exchanges' && req.method === 'GET') {
    const exchanges = [
      { name: 'binance', url: 'https://api.binance.com/api/v3/ping' },
      { name: 'okx', url: 'https://www.okx.com/api/v5/public/time' },
      { name: 'bybit', url: 'https://api.bybit.com/v5/market/time' },
      { name: 'bitget', url: 'https://api.bitget.com/api/v2/public/time' },
      { name: 'bingx', url: 'https://open-api.bingx.com/openApi/swap/v2/server/time' },
      { name: 'mexc', url: 'https://api.mexc.com/api/v3/ping' },
      { name: 'gateio', url: 'https://api.gateio.ws/api/v4/spot/time' },
      { name: 'kucoin', url: 'https://api.kucoin.com/api/v1/timestamp' },
      { name: 'kraken', url: 'https://api.kraken.com/0/public/Time' },
      { name: 'hyperliquid', url: 'https://api.hyperliquid.xyz/info' }
    ];

    console.log('[HFT] Pinging ' + exchanges.length + ' exchanges...');
    
    const results = await Promise.all(exchanges.map(async (ex) => {
      const start = Date.now();
      try {
        await new Promise((resolve, reject) => {
          const req = https.get(ex.url, { timeout: 5000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        });
        
        const latency = Date.now() - start;
        console.log('[HFT] ' + ex.name + ': ' + latency + 'ms');
        return { exchange: ex.name, latency_ms: latency, status: 'ok' };
      } catch (err) {
        const latency = Date.now() - start;
        return { exchange: ex.name, latency_ms: latency, status: 'error', error: err.message };
      }
    }));

    res.writeHead(200);
    res.end(JSON.stringify({ success: true, source: 'vps', pings: results }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(8080, '0.0.0.0', () => {
  console.log('[HFT] Health check + Balance proxy running on port 8080');
});

process.on('SIGTERM', () => {
  console.log('[HFT] Shutting down...');
  server.close();
  process.exit(0);
});`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      'https://iibdlazwkossyelyroap.supabase.co',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // Get SSH private key from Supabase secret
    const sshPrivateKey = Deno.env.get('VULTR_SSH_PRIVATE_KEY');
    
    if (!sshPrivateKey) {
      return new Response(JSON.stringify({
        success: false,
        error: 'VULTR_SSH_PRIVATE_KEY secret not configured'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get VPS config
    const { data: vpsConfig } = await supabase
      .from('vps_config')
      .select('outbound_ip, provider, region')
      .eq('status', 'running')
      .not('outbound_ip', 'is', null)
      .single();

    if (!vpsConfig?.outbound_ip) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No active VPS found'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[update-vps-bot] Updating bot on ${vpsConfig.outbound_ip}`);

    // Use ssh-command to update the health.js file
    const updateCommand = `cat > /opt/hft-bot/app/health.js << 'HEALTHEOF'
${HEALTH_JS_CODE}
HEALTHEOF

# Restart the container
cd /opt/hft-bot && docker-compose restart hft-bot 2>/dev/null || docker compose restart hft-bot

# Wait for container to be ready
sleep 3

# Test the endpoint
curl -s http://localhost:8080/health | head -c 100`;

    const { data: sshResult, error: sshError } = await supabase.functions.invoke('ssh-command', {
      body: {
        ipAddress: vpsConfig.outbound_ip,
        privateKey: sshPrivateKey,
        username: 'root',
        command: updateCommand
      }
    });

    if (sshError) {
      throw new Error(`SSH failed: ${sshError.message}`);
    }

    console.log(`[update-vps-bot] Update result:`, sshResult);

    // Test the ping endpoint
    try {
      const testResponse = await fetch(`http://${vpsConfig.outbound_ip}:8080/ping-exchanges`, {
        method: 'GET'
      });
      
      if (testResponse.ok) {
        const testData = await testResponse.json();
        return new Response(JSON.stringify({
          success: true,
          message: 'VPS bot updated successfully',
          vps_ip: vpsConfig.outbound_ip,
          ping_test: testData
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } catch (testErr) {
      console.log(`[update-vps-bot] Ping test failed, but update may still be in progress`);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'VPS bot update initiated',
      vps_ip: vpsConfig.outbound_ip,
      ssh_output: sshResult?.output || 'Update command executed'
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[update-vps-bot] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: String(err)
    }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
