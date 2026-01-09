import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Minimal health.js with /control endpoint for trading mode support
const HEALTH_JS_WITH_CONTROL = `const http = require('http');
const https = require('https');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');

const startTime = Date.now();
const BOT_VERSION = '2.1.0';

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
  version: BOT_VERSION,
  strategy: process.env.STRATEGY_NAME || 'profit-piranha'
});

const signBinance = (query, secret) => crypto.createHmac('sha256', secret).update(query).digest('hex');

const signOKX = (timestamp, method, path, body, secret) => {
  return crypto.createHmac('sha256', secret).update(timestamp + method + path + body).digest('base64');
};

const fetchBinanceBalance = (apiKey, apiSecret) => new Promise((resolve) => {
  const timestamp = Date.now();
  const query = 'timestamp=' + timestamp;
  const signature = signBinance(query, apiSecret);
  https.get({
    hostname: 'api.binance.com',
    path: '/api/v3/account?' + query + '&signature=' + signature,
    headers: { 'X-MBX-APIKEY': apiKey }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        const usdt = json.balances && json.balances.find(b => b.asset === 'USDT');
        resolve(parseFloat((usdt && usdt.free) || 0) + parseFloat((usdt && usdt.locked) || 0));
      } catch (e) { resolve(0); }
    });
  }).on('error', () => resolve(0));
});

const fetchOKXBalance = (apiKey, apiSecret, passphrase) => new Promise((resolve) => {
  const timestamp = new Date().toISOString();
  const path = '/api/v5/account/balance';
  const sign = signOKX(timestamp, 'GET', path, '', apiSecret);
  https.get({
    hostname: 'www.okx.com',
    path: path,
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase || ''
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.code === '0') {
          const details = (json.data && json.data[0] && json.data[0].details) || [];
          const usdt = details.find(d => d.ccy === 'USDT');
          resolve({ success: true, balance: parseFloat((usdt && usdt.availBal) || 0) });
        } else {
          resolve({ success: false, balance: 0, error: json.msg });
        }
      } catch (e) { resolve({ success: false, balance: 0 }); }
    });
  }).on('error', () => resolve({ success: false, balance: 0 }));
});

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
  } else if (req.url === '/balance' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        if (data.exchange === 'binance') {
          const balance = await fetchBinanceBalance(data.apiKey, data.apiSecret);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, balance: balance, exchange: 'binance' }));
        } else if (data.exchange === 'okx') {
          const result = await fetchOKXBalance(data.apiKey, data.apiSecret, data.passphrase);
          res.writeHead(200);
          res.end(JSON.stringify({ ...result, exchange: 'okx' }));
        } else {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Unsupported exchange' }));
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
      { name: 'bybit', url: 'https://api.bybit.com/v5/market/time' }
    ];
    const results = await Promise.all(exchanges.map(async (ex) => {
      const start = Date.now();
      try {
        await new Promise((resolve, reject) => {
          const r = https.get(ex.url, { timeout: 5000 }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(d));
          });
          r.on('error', reject);
          r.on('timeout', () => { r.destroy(); reject(new Error('Timeout')); });
        });
        return { exchange: ex.name, latency_ms: Date.now() - start, status: 'ok' };
      } catch (err) {
        return { exchange: ex.name, latency_ms: Date.now() - start, status: 'error', error: err.message };
      }
    }));
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, source: 'vps', version: BOT_VERSION, pings: results }));
  } else if (req.url === '/control' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const SIGNAL_FILE = '/app/data/START_SIGNAL';
        
        if (data.action === 'start') {
          const signalData = JSON.stringify({ 
            started_at: new Date().toISOString(),
            source: 'dashboard',
            mode: data.mode || 'paper'
          });
          fs.mkdirSync('/app/data', { recursive: true });
          fs.writeFileSync(SIGNAL_FILE, signalData);
          console.log('[HFT] START_SIGNAL created - Mode: ' + (data.mode || 'paper'));
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, action: 'start', mode: data.mode || 'paper', signal_created: true }));
        } else if (data.action === 'stop') {
          try { fs.unlinkSync(SIGNAL_FILE); } catch (e) {}
          console.log('[HFT] START_SIGNAL removed');
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, action: 'stop', signal_removed: true }));
        } else {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Invalid action' }));
        }
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
  } else if (req.url === '/update-bot' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.secret !== (process.env.BOT_UPDATE_SECRET || 'hft-update-2024')) {
          res.writeHead(403);
          res.end(JSON.stringify({ success: false, error: 'Invalid secret' }));
          return;
        }
        if (!data.code) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Missing code' }));
          return;
        }
        fs.writeFileSync('/app/health.js.new', data.code);
        try { new Function(data.code); } catch (e) {
          fs.unlinkSync('/app/health.js.new');
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Syntax error: ' + e.message }));
          return;
        }
        fs.renameSync('/app/health.js.new', '/app/health.js');
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: 'Updated, restarting' }));
        setTimeout(() => process.exit(0), 200);
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(8080, '0.0.0.0', () => {
  console.log('[HFT] Health + Control running on :8080 (v' + BOT_VERSION + ')');
});

process.on('SIGTERM', () => {
  server.close();
  process.exit(0);
});
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get VPS IP from vps_instances
    const { data: vps } = await supabase
      .from('vps_instances')
      .select('ip_address')
      .eq('status', 'running')
      .not('ip_address', 'is', null)
      .limit(1)
      .single();

    if (!vps?.ip_address) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No running VPS found'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const vpsIp = vps.ip_address;
    console.log(`[push-vps-control] Pushing control endpoint to VPS at ${vpsIp}`);

    // Check VPS is reachable
    const healthCheck = await fetch(`http://${vpsIp}:8080/health`, {
      signal: AbortSignal.timeout(5000)
    });

    if (!healthCheck.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: 'VPS not reachable'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const healthData = await healthCheck.json();
    console.log(`[push-vps-control] VPS current version: ${healthData.version}`);

    // Push the new code
    const updateResponse = await fetch(`http://${vpsIp}:8080/update-bot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: HEALTH_JS_WITH_CONTROL,
        secret: 'hft-update-2024'
      }),
      signal: AbortSignal.timeout(30000)
    });

    const updateResult = await updateResponse.json();
    
    if (!updateResponse.ok || !updateResult.success) {
      return new Response(JSON.stringify({
        success: false,
        error: updateResult.error || 'Update failed',
        previousVersion: healthData.version
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Wait for restart
    await new Promise(r => setTimeout(r, 3000));

    // Verify update
    try {
      const verifyResponse = await fetch(`http://${vpsIp}:8080/health`, {
        signal: AbortSignal.timeout(10000)
      });
      const verifyData = await verifyResponse.json();
      
      return new Response(JSON.stringify({
        success: true,
        previousVersion: healthData.version,
        newVersion: verifyData.version,
        vpsIp
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch {
      return new Response(JSON.stringify({
        success: true,
        message: 'Update sent, VPS restarting',
        previousVersion: healthData.version,
        vpsIp
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (err) {
    console.error('[push-vps-control] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: String(err)
    }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
