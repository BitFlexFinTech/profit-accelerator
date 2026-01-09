import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// FIXED health.js with proper newline handling in /control endpoint
// Using regular string concatenation to avoid template literal escaping issues
const FIXED_HEALTH_JS = `const http = require('http');
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
  const message = timestamp + method + path + body;
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
};

const fetchBinanceBalance = async (apiKey, apiSecret) => {
  return new Promise((resolve) => {
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
          const usdt = json.balances?.find(b => b.asset === 'USDT');
          resolve(parseFloat(usdt?.free || 0) + parseFloat(usdt?.locked || 0));
        } catch { resolve(0); }
      });
    }).on('error', () => resolve(0));
  });
};

const fetchOKXBalance = async (apiKey, apiSecret, passphrase) => {
  let total = 0;
  try {
    const result = await new Promise((resolve, reject) => {
      const timestamp = new Date().toISOString();
      const path = '/api/v5/account/balance';
      const sign = signOKX(timestamp, 'GET', path, '', apiSecret);
      https.get({
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
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });
    if (result.code === '0') {
      const details = result.data?.[0]?.details || [];
      const usdt = details.find(d => d.ccy === 'USDT');
      total += parseFloat(usdt?.availBal || 0);
    }
  } catch {}
  
  try {
    const result = await new Promise((resolve, reject) => {
      const timestamp = new Date().toISOString();
      const path = '/api/v5/asset/balances';
      const sign = signOKX(timestamp, 'GET', path, '', apiSecret);
      https.get({
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
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });
    if (result.code === '0') {
      const usdt = result.data?.find(d => d.ccy === 'USDT');
      total += parseFloat(usdt?.availBal || 0);
    }
  } catch {}
  
  return { success: total > 0, balance: total };
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200);
    res.end(JSON.stringify(getMetrics()));
  } else if (req.url === '/balance' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { exchange, apiKey, apiSecret, passphrase } = JSON.parse(body);
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
          res.end(JSON.stringify({ success: false, error: 'Unsupported exchange' }));
        }
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: String(err) }));
      }
    });
  } else if (req.url === '/control' && req.method === 'POST') {
    // FIXED: Bot control endpoint with proper newline handling
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { action, mode, env } = JSON.parse(body);
        const SIGNAL_FILE = '/app/data/START_SIGNAL';
        const ENV_FILE = '/app/data/.env.runtime';
        
        if (action === 'start') {
          // Apply environment variables
          if (env && typeof env === 'object') {
            Object.keys(env).forEach(key => {
              process.env[key] = env[key];
              console.log('[PIRANHA] Set env: ' + key + '=' + (key.includes('SECRET') || key.includes('KEY') ? '***' : env[key]));
            });
            
            // CRITICAL FIX: Write with actual newlines using String.fromCharCode(10)
            const envFileContent = Object.entries(env)
              .map(function(entry) { return entry[0] + '=' + entry[1]; })
              .join(String.fromCharCode(10));
            fs.writeFileSync(ENV_FILE, envFileContent);
            console.log('[PIRANHA] Wrote ' + Object.keys(env).length + ' env vars to ' + ENV_FILE);
          }
          
          const signalData = JSON.stringify({ 
            started_at: new Date().toISOString(),
            source: 'dashboard',
            mode: 'live',
            envCount: env ? Object.keys(env).length : 0
          });
          fs.writeFileSync(SIGNAL_FILE, signalData);
          console.log('[PIRANHA] START_SIGNAL created');
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, action: 'start', mode: 'live', signal_created: true }));
        } else if (action === 'stop') {
          if (fs.existsSync(SIGNAL_FILE)) fs.unlinkSync(SIGNAL_FILE);
          console.log('[PIRANHA] START_SIGNAL removed');
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
    req.on('end', async () => {
      try {
        const { code, secret } = JSON.parse(body);
        const updateSecret = process.env.BOT_UPDATE_SECRET || 'hft-update-2024';
        if (secret !== updateSecret) {
          res.writeHead(403);
          res.end(JSON.stringify({ success: false, error: 'Invalid secret' }));
          return;
        }
        if (!code) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Missing code' }));
          return;
        }
        const tempPath = '/app/health.js.new';
        const mainPath = '/app/health.js';
        fs.writeFileSync(tempPath, code);
        try { new Function(code); } catch (e) {
          fs.unlinkSync(tempPath);
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Syntax error: ' + e.message }));
          return;
        }
        fs.renameSync(tempPath, mainPath);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: 'Updated, restarting...', version: BOT_VERSION }));
        setTimeout(() => process.exit(0), 200);
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
          https.get(ex.url, { timeout: 5000 }, (r) => {
            let d = '';
            r.on('data', c => d += c);
            r.on('end', () => resolve(d));
          }).on('error', reject);
        });
        return { exchange: ex.name, latency_ms: Date.now() - start, status: 'ok' };
      } catch {
        return { exchange: ex.name, latency_ms: Date.now() - start, status: 'error' };
      }
    }));
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, pings: results }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(8080, '0.0.0.0', () => {
  console.log('[PIRANHA] Health + Control endpoint v' + BOT_VERSION + ' on port 8080');
});

process.on('SIGTERM', () => { server.close(); process.exit(0); });
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get running VPS
    const { data: vps } = await supabase
      .from('vps_instances')
      .select('ip_address')
      .eq('status', 'running')
      .not('ip_address', 'is', null)
      .single();

    if (!vps?.ip_address) {
      return new Response(JSON.stringify({ success: false, error: 'No running VPS found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[push-vps-fix] Pushing fixed health.js to ${vps.ip_address}...`);

    // Push fix to VPS
    const response = await fetch(`http://${vps.ip_address}:8080/update-bot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: FIXED_HEALTH_JS,
        secret: 'hft-update-2024'
      }),
      signal: AbortSignal.timeout(30000)
    });

    const result = await response.json();
    console.log(`[push-vps-fix] Result:`, result);

    if (result.success) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Fixed health.js pushed to VPS. Bot will restart with proper newline handling.',
        vps_ip: vps.ip_address,
        new_version: '2.1.0'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      throw new Error(result.error || 'Update failed');
    }
  } catch (err) {
    console.error('[push-vps-fix] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: String(err)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
