import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// The latest health.js code with /ping-exchanges and /update-bot endpoints
const HEALTH_JS_CODE = `const http = require('http');
const https = require('https');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');

const startTime = Date.now();
const BOT_VERSION = '1.2.0';

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
  version: BOT_VERSION
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
    res.end(JSON.stringify({ success: true, source: 'vps', version: BOT_VERSION, pings: results }));
  } else if (req.url === '/update-bot' && req.method === 'POST') {
    // Self-update endpoint - accepts new health.js code via HTTP POST
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { code, secret } = JSON.parse(body);
        
        // Validate update secret
        const updateSecret = process.env.BOT_UPDATE_SECRET || 'hft-update-2024';
        if (secret !== updateSecret) {
          res.writeHead(403);
          res.end(JSON.stringify({ success: false, error: 'Invalid update secret' }));
          return;
        }
        
        if (!code || typeof code !== 'string') {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Missing or invalid code' }));
          return;
        }
        
        // Write new code to temp file first
        const tempPath = '/app/health.js.new';
        const mainPath = '/app/health.js';
        
        console.log('[HFT] Writing new code to temp file...');
        fs.writeFileSync(tempPath, code);
        
        // Basic syntax validation - try to parse as JS
        try {
          new Function(code);
        } catch (syntaxErr) {
          fs.unlinkSync(tempPath);
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Syntax error: ' + syntaxErr.message }));
          return;
        }
        
        // Replace current health.js with new code
        console.log('[HFT] Replacing health.js...');
        fs.renameSync(tempPath, mainPath);
        
        res.writeHead(200);
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Bot code updated, container will restart',
          version: BOT_VERSION
        }));
        
        // Exit process - Docker will auto-restart with new code
        console.log('[HFT] Exiting for restart with new code...');
        setTimeout(() => process.exit(0), 200);
        
      } catch (err) {
        console.error('[HFT] Update error:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: String(err) }));
      }
    });
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(8080, '0.0.0.0', () => {
  console.log('[HFT] Health check + Balance proxy running on port 8080 (v' + BOT_VERSION + ')');
});

process.on('SIGTERM', () => {
  console.log('[HFT] Shutting down...');
  server.close();
  process.exit(0);
});`;

// Update secret for VPS bot updates
const UPDATE_SECRET = 'hft-update-2024';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      'https://iibdlazwkossyelyroap.supabase.co',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

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

    const vpsIp = vpsConfig.outbound_ip;
    console.log(`[update-vps-bot] Updating bot on ${vpsIp} via HTTP`);

    // First, check if VPS is reachable and has the /update-bot endpoint
    let hasUpdateEndpoint = false;
    let currentVersion = 'unknown';
    
    try {
      const healthCheck = await fetch(`http://${vpsIp}:8080/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      if (healthCheck.ok) {
        const healthData = await healthCheck.json();
        currentVersion = healthData.version || 'unknown';
        console.log(`[update-vps-bot] VPS is reachable, current version: ${currentVersion}`);
        
        // Try calling update endpoint to see if it exists
        try {
          const updateCheck = await fetch(`http://${vpsIp}:8080/update-bot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: '', secret: 'invalid' }), // Will fail auth but confirm endpoint exists
            signal: AbortSignal.timeout(5000)
          });
          // 400 or 403 means endpoint exists, 404 means it doesn't
          hasUpdateEndpoint = updateCheck.status !== 404;
        } catch {
          hasUpdateEndpoint = false;
        }
      }
    } catch (err) {
      console.log(`[update-vps-bot] VPS health check failed: ${err}`);
      return new Response(JSON.stringify({
        success: false,
        error: `VPS unreachable at ${vpsIp}:8080. Please run the install script manually: ssh root@${vpsIp} "curl -fsSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | bash"`
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // If VPS doesn't have /update-bot endpoint, user needs to run install script
    if (!hasUpdateEndpoint) {
      console.log(`[update-vps-bot] VPS lacks /update-bot endpoint, manual update required`);
      return new Response(JSON.stringify({
        success: false,
        needs_manual_update: true,
        current_version: currentVersion,
        error: `VPS bot (v${currentVersion}) doesn't have remote update capability. Please run:\n\nssh root@${vpsIp} "curl -fsSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | bash"`
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // VPS has /update-bot endpoint - push new code via HTTP
    console.log(`[update-vps-bot] Pushing new code to VPS via HTTP POST...`);
    
    const updateResponse = await fetch(`http://${vpsIp}:8080/update-bot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: HEALTH_JS_CODE,
        secret: UPDATE_SECRET
      }),
      signal: AbortSignal.timeout(30000)
    });

    const updateResult = await updateResponse.json();
    
    if (!updateResponse.ok || !updateResult.success) {
      throw new Error(updateResult.error || `Update failed with status ${updateResponse.status}`);
    }

    console.log(`[update-vps-bot] Update successful, waiting for restart...`);

    // Wait for container to restart
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify the update by calling /ping-exchanges
    try {
      const verifyResponse = await fetch(`http://${vpsIp}:8080/ping-exchanges`, {
        method: 'GET',
        signal: AbortSignal.timeout(15000)
      });

      if (verifyResponse.ok) {
        const verifyData = await verifyResponse.json();
        return new Response(JSON.stringify({
          success: true,
          message: 'VPS bot updated and verified',
          vps_ip: vpsIp,
          previous_version: currentVersion,
          new_version: verifyData.version || '1.2.0',
          ping_test: verifyData
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } catch (verifyErr) {
      console.log(`[update-vps-bot] Verification failed, but update may still be pending: ${verifyErr}`);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'VPS bot update initiated, container restarting',
      vps_ip: vpsIp,
      previous_version: currentVersion
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
