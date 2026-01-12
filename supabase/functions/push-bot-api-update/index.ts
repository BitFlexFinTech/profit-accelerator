import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// The new index.js content for the VPS bot control API
const NEW_INDEX_JS = `/**
 * VPS Bot Control API - Expanded Implementation
 * 
 * Deploy to: /opt/bot-control-api/index.js
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

const PORT = 3000;

// CCXT exchange mapping
const EXCHANGE_MAP = {
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
};

// Helper: Parse JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Helper: Send JSON response
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// Helper: HMAC-SHA256 for Binance
function signBinance(query, secret) {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

// Helper: HMAC-SHA256 for OKX (Base64)
function signOKX(timestamp, method, path, body, secret) {
  const message = timestamp + method + path + body;
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
}

// Helper: Make HTTPS request
function httpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (postData) req.write(postData);
    req.end();
  });
}

// ============ HANDLERS ============

// GET /health - Health check
async function handleHealth(req, res) {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();
  
  sendJSON(res, 200, {
    ok: true,
    uptime: Math.floor(uptime),
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024)
    },
    timestamp: new Date().toISOString()
  });
}

// GET /status - Docker and bot status
async function handleStatus(req, res) {
  try {
    const { stdout: dockerPs } = await execAsync('docker ps --format "{{.Names}}: {{.Status}}"').catch(() => ({ stdout: '' }));
    const { stdout: botStatus } = await execAsync('systemctl is-active hft-bot 2>/dev/null || echo "inactive"').catch(() => ({ stdout: 'unknown' }));
    const { stdout: loadAvg } = await execAsync('cat /proc/loadavg').catch(() => ({ stdout: '0 0 0' }));
    const [load1, load5, load15] = loadAvg.trim().split(' ').map(parseFloat);
    const { stdout: diskUsage } = await execAsync("df -h / | tail -1 | awk '{print $5}'").catch(() => ({ stdout: '0%' }));
    
    sendJSON(res, 200, {
      success: true,
      bot: {
        status: botStatus.trim(),
        running: botStatus.trim() === 'active'
      },
      docker: {
        containers: dockerPs.trim().split('\\n').filter(Boolean)
      },
      system: {
        load: { load1, load5, load15 },
        diskUsage: diskUsage.trim()
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    sendJSON(res, 500, { success: false, error: err.message });
  }
}

// GET /state - Strategy state
async function handleState(req, res) {
  try {
    const { stdout: stateFile } = await execAsync('cat /opt/hft-bot/state.json 2>/dev/null || echo "{}"').catch(() => ({ stdout: '{}' }));
    
    let state = {};
    try {
      state = JSON.parse(stateFile);
    } catch (e) {
      state = { raw: stateFile };
    }
    
    sendJSON(res, 200, {
      success: true,
      state,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    sendJSON(res, 500, { success: false, error: err.message });
  }
}

// GET /logs - Recent bot logs
async function handleLogs(req, res) {
  try {
    const url = new URL(req.url, \`http://\${req.headers.host}\`);
    const lines = parseInt(url.searchParams.get('lines') || '50', 10);
    const { stdout: logs } = await execAsync(\`journalctl -u hft-bot -n \${lines} --no-pager 2>/dev/null || tail -\${lines} /var/log/hft-bot.log 2>/dev/null || echo "No logs available"\`);
    
    sendJSON(res, 200, {
      success: true,
      logs: logs.trim().split('\\n'),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    sendJSON(res, 500, { success: false, error: err.message });
  }
}

// POST /control - Start/stop bot (FIXED: Creates START_SIGNAL file)
async function handleControl(req, res) {
  try {
    const body = await parseBody(req);
    const { action, env, command } = body;
    
    if (!['start', 'stop', 'restart'].includes(action)) {
      return sendJSON(res, 400, { success: false, error: 'Invalid action. Use: start, stop, restart' });
    }
    
    const SIGNAL_FILE = '/opt/hft-bot/app/data/START_SIGNAL';
    const ENV_FILE = '/opt/hft-bot/.env.exchanges';
    const DATA_DIR = '/opt/hft-bot/app/data';
    const BOT_DIR = '/opt/hft-bot';
    
    console.log(\`[control] Action: \${action}, env keys: \${env ? Object.keys(env).length : 0}\`);
    
    if (action === 'start' || action === 'restart') {
      // 1. Ensure data directory exists
      try {
        await execAsync(\`mkdir -p \${DATA_DIR}\`);
      } catch (e) {
        console.log('[control] mkdir error (may already exist):', e.message);
      }
      
      // 2. Write environment variables if provided
      if (env && typeof env === 'object' && Object.keys(env).length > 0) {
        const envContent = Object.entries(env)
          .map(([k, v]) => \`\${k}=\${v}\`)
          .join('\\n');
        try {
          fs.writeFileSync(ENV_FILE, envContent);
          console.log(\`[control] Wrote \${Object.keys(env).length} env vars to \${ENV_FILE}\`);
        } catch (e) {
          console.error('[control] Failed to write env file:', e.message);
        }
      }
      
      // 3. CREATE START_SIGNAL FILE (CRITICAL!)
      const signalData = JSON.stringify({
        started_at: new Date().toISOString(),
        source: 'dashboard',
        mode: 'live',
        action: action
      });
      
      try {
        fs.writeFileSync(SIGNAL_FILE, signalData);
        console.log(\`[control] ✅ Created START_SIGNAL at \${SIGNAL_FILE}\`);
      } catch (e) {
        console.error('[control] ❌ Failed to create START_SIGNAL:', e.message);
        return sendJSON(res, 500, { 
          success: false, 
          error: \`Failed to create START_SIGNAL: \${e.message}\`,
          signalCreated: false
        });
      }
      
      // 4. Start/restart Docker container
      try {
        if (action === 'restart') {
          await execAsync(\`cd \${BOT_DIR} && docker compose down 2>/dev/null || true\`);
        }
        await execAsync(\`cd \${BOT_DIR} && docker compose up -d --remove-orphans\`);
        console.log('[control] Docker compose started');
      } catch (e) {
        console.log('[control] Docker start warning:', e.message);
      }
      
      // 5. Verify signal file was created
      await new Promise(r => setTimeout(r, 500));
      const signalExists = fs.existsSync(SIGNAL_FILE);
      
      if (!signalExists) {
        console.error('[control] ❌ Signal file does not exist after creation!');
        return sendJSON(res, 500, { 
          success: false, 
          error: 'START_SIGNAL was not created',
          signalCreated: false
        });
      }
      
      // 6. Check Docker status
      let dockerStatus = 'unknown';
      try {
        const { stdout } = await execAsync('docker ps --filter name=hft --format "{{.Status}}" 2>/dev/null | head -1');
        dockerStatus = stdout.trim() || 'starting';
      } catch (e) {
        dockerStatus = 'error';
      }
      
      console.log(\`[control] ✅ Bot started successfully. Signal: true, Docker: \${dockerStatus}\`);
      
      return sendJSON(res, 200, {
        success: true,
        action,
        signalCreated: true,
        signalFile: SIGNAL_FILE,
        dockerStatus,
        status: 'active',
        output: 'SIGNAL_VERIFIED:true',
        timestamp: new Date().toISOString()
      });
    }
    
    if (action === 'stop') {
      // 1. Remove signal file first
      try {
        if (fs.existsSync(SIGNAL_FILE)) {
          fs.unlinkSync(SIGNAL_FILE);
          console.log('[control] Removed START_SIGNAL');
        }
      } catch (e) {
        console.log('[control] Signal removal warning:', e.message);
      }
      
      // 2. Stop Docker container
      try {
        await execAsync(\`cd \${BOT_DIR} && docker compose down 2>/dev/null || docker stop hft-bot 2>/dev/null || true\`);
        console.log('[control] Docker stopped');
      } catch (e) {
        console.log('[control] Docker stop warning:', e.message);
      }
      
      return sendJSON(res, 200, {
        success: true,
        action: 'stop',
        signalCreated: false,
        status: 'stopped',
        output: 'Bot stopped',
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (err) {
    console.error('[control] Error:', err.message);
    sendJSON(res, 500, { success: false, error: err.message, signalCreated: false });
  }
}

// GET /ping-exchanges - Test exchange latency
async function handlePingExchanges(req, res) {
  const exchanges = [
    { name: 'binance', host: 'api.binance.com', path: '/api/v3/ping' },
    { name: 'okx', host: 'www.okx.com', path: '/api/v5/public/time' },
    { name: 'bybit', host: 'api.bybit.com', path: '/v5/market/time' },
  ];
  
  const results = await Promise.all(exchanges.map(async (ex) => {
    const start = Date.now();
    try {
      await httpsRequest({ hostname: ex.host, path: ex.path, method: 'GET' });
      return { exchange: ex.name, latencyMs: Date.now() - start, status: 'ok' };
    } catch (err) {
      return { exchange: ex.name, latencyMs: Date.now() - start, status: 'error', error: err.message };
    }
  }));
  
  sendJSON(res, 200, {
    success: true,
    pings: results,
    timestamp: new Date().toISOString()
  });
}

// POST /balance - Fetch exchange balance (proxy for IP-whitelisted keys)
async function handleBalance(req, res) {
  try {
    const body = await parseBody(req);
    const { exchange, apiKey, apiSecret, passphrase } = body;
    
    if (!exchange || !apiKey || !apiSecret) {
      return sendJSON(res, 400, { success: false, error: 'Missing required fields: exchange, apiKey, apiSecret' });
    }
    
    const exchangeId = EXCHANGE_MAP[exchange.toLowerCase()] || exchange.toLowerCase();
    let totalUSDT = 0;
    let assets = [];
    
    if (exchangeId === 'binance') {
      const timestamp = Date.now();
      const query = \`timestamp=\${timestamp}\`;
      const signature = signBinance(query, apiSecret);
      
      const spotRes = await httpsRequest({
        hostname: 'api.binance.com',
        path: \`/api/v3/account?\${query}&signature=\${signature}\`,
        method: 'GET',
        headers: { 'X-MBX-APIKEY': apiKey }
      });
      
      if (spotRes.statusCode === 200 && spotRes.data.balances) {
        for (const bal of spotRes.data.balances) {
          const free = parseFloat(bal.free) || 0;
          const locked = parseFloat(bal.locked) || 0;
          if (free + locked > 0) {
            if (bal.asset === 'USDT') {
              totalUSDT += free + locked;
            }
            assets.push({ symbol: bal.asset, amount: free + locked });
          }
        }
      }
      
      const futuresRes = await httpsRequest({
        hostname: 'fapi.binance.com',
        path: \`/fapi/v2/balance?\${query}&signature=\${signature}\`,
        method: 'GET',
        headers: { 'X-MBX-APIKEY': apiKey }
      }).catch(() => null);
      
      if (futuresRes?.statusCode === 200 && Array.isArray(futuresRes.data)) {
        const usdtFutures = futuresRes.data.find(b => b.asset === 'USDT');
        if (usdtFutures) {
          totalUSDT += parseFloat(usdtFutures.balance) || 0;
        }
      }
      
    } else if (exchangeId === 'okx') {
      const timestamp = new Date().toISOString();
      const reqPath = '/api/v5/account/balance';
      const sign = signOKX(timestamp, 'GET', reqPath, '', apiSecret);
      
      const okxRes = await httpsRequest({
        hostname: 'www.okx.com',
        path: reqPath,
        method: 'GET',
        headers: {
          'OK-ACCESS-KEY': apiKey,
          'OK-ACCESS-SIGN': sign,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-PASSPHRASE': passphrase || '',
          'Content-Type': 'application/json'
        }
      });
      
      if (okxRes.statusCode === 200 && okxRes.data.data?.[0]?.details) {
        for (const detail of okxRes.data.data[0].details) {
          const avail = parseFloat(detail.availBal) || 0;
          const frozen = parseFloat(detail.frozenBal) || 0;
          if (avail + frozen > 0) {
            if (detail.ccy === 'USDT') {
              totalUSDT += avail + frozen;
            }
            assets.push({ symbol: detail.ccy, amount: avail + frozen });
          }
        }
      }
      
    } else {
      return sendJSON(res, 400, { success: false, error: \`Exchange \${exchange} not supported yet\` });
    }
    
    sendJSON(res, 200, {
      success: true,
      exchange: exchangeId,
      totalUSDT,
      assets,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    sendJSON(res, 500, { success: false, error: err.message });
  }
}

// POST /place-order - Execute trade
async function handlePlaceOrder(req, res) {
  try {
    const body = await parseBody(req);
    const { exchange, symbol, side, quantity, orderType, price, apiKey, apiSecret, passphrase } = body;
    
    if (!exchange || !symbol || !side || !quantity || !apiKey || !apiSecret) {
      return sendJSON(res, 400, { 
        success: false, 
        error: 'Missing required fields: exchange, symbol, side, quantity, apiKey, apiSecret' 
      });
    }
    
    const startTime = Date.now();
    const exchangeId = EXCHANGE_MAP[exchange.toLowerCase()] || exchange.toLowerCase();
    
    let orderId = null;
    let executedPrice = null;
    
    if (exchangeId === 'binance') {
      const timestamp = Date.now();
      const params = new URLSearchParams({
        symbol: symbol.replace('/', ''),
        side: side.toUpperCase(),
        type: (orderType || 'MARKET').toUpperCase(),
        quantity: quantity.toString(),
        timestamp: timestamp.toString(),
      });
      
      if (orderType === 'limit' && price) {
        params.set('price', price.toString());
        params.set('timeInForce', 'GTC');
      }
      
      const signature = signBinance(params.toString(), apiSecret);
      params.set('signature', signature);
      
      const orderRes = await httpsRequest({
        hostname: 'api.binance.com',
        path: '/api/v3/order',
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }, params.toString());
      
      if (orderRes.statusCode === 200) {
        orderId = orderRes.data.orderId?.toString();
        executedPrice = parseFloat(orderRes.data.fills?.[0]?.price) || parseFloat(orderRes.data.price) || price;
      } else {
        throw new Error(orderRes.data.msg || \`Binance error: \${orderRes.statusCode}\`);
      }
      
    } else if (exchangeId === 'okx') {
      const timestamp = new Date().toISOString();
      const reqPath = '/api/v5/trade/order';
      const orderBody = JSON.stringify({
        instId: symbol.replace('/', '-'),
        tdMode: 'cash',
        side: side.toLowerCase(),
        ordType: orderType === 'limit' ? 'limit' : 'market',
        sz: quantity.toString(),
        ...(orderType === 'limit' && price ? { px: price.toString() } : {})
      });
      
      const sign = signOKX(timestamp, 'POST', reqPath, orderBody, apiSecret);
      
      const orderRes = await httpsRequest({
        hostname: 'www.okx.com',
        path: reqPath,
        method: 'POST',
        headers: {
          'OK-ACCESS-KEY': apiKey,
          'OK-ACCESS-SIGN': sign,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-PASSPHRASE': passphrase || '',
          'Content-Type': 'application/json'
        }
      }, orderBody);
      
      if (orderRes.statusCode === 200 && orderRes.data.code === '0') {
        orderId = orderRes.data.data?.[0]?.ordId;
        executedPrice = price;
      } else {
        throw new Error(orderRes.data.msg || \`OKX error: \${orderRes.statusCode}\`);
      }
      
    } else {
      return sendJSON(res, 400, { success: false, error: \`Exchange \${exchange} not supported for trading yet\` });
    }
    
    const latencyMs = Date.now() - startTime;
    
    sendJSON(res, 200, {
      success: true,
      orderId,
      executedPrice,
      latencyMs,
      exchange: exchangeId,
      symbol,
      side,
      quantity,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    sendJSON(res, 500, { success: false, error: err.message });
  }
}

// GET /signal-check - Verify START_SIGNAL file exists
async function handleSignalCheck(req, res) {
  const SIGNAL_FILE = '/opt/hft-bot/app/data/START_SIGNAL';
  
  try {
    const signalExists = fs.existsSync(SIGNAL_FILE);
    let signalData = null;
    let signalAge = null;
    
    if (signalExists) {
      try {
        const content = fs.readFileSync(SIGNAL_FILE, 'utf8');
        signalData = JSON.parse(content);
        if (signalData.started_at) {
          signalAge = Date.now() - new Date(signalData.started_at).getTime();
        }
      } catch (e) {
        signalData = { raw: 'Unable to parse' };
      }
    }
    
    let dockerRunning = false;
    try {
      const { stdout } = await execAsync('docker ps --filter name=hft --format "{{.Status}}" 2>/dev/null | head -1');
      dockerRunning = stdout.trim().includes('Up');
    } catch {}
    
    sendJSON(res, 200, {
      signalExists,
      signalData,
      signalAgeMs: signalAge,
      dockerRunning,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    sendJSON(res, 500, { success: false, error: err.message, signalExists: false });
  }
}

// ============ SERVER ============

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }
  
  const url = new URL(req.url, \`http://\${req.headers.host}\`);
  const urlPath = url.pathname;
  
  console.log(\`[\${new Date().toISOString()}] \${req.method} \${urlPath}\`);
  
  try {
    if (urlPath === '/health' && req.method === 'GET') {
      await handleHealth(req, res);
    } else if (urlPath === '/status' && req.method === 'GET') {
      await handleStatus(req, res);
    } else if (urlPath === '/state' && req.method === 'GET') {
      await handleState(req, res);
    } else if (urlPath === '/logs' && req.method === 'GET') {
      await handleLogs(req, res);
    } else if (urlPath === '/control' && req.method === 'POST') {
      await handleControl(req, res);
    } else if (urlPath === '/signal-check' && req.method === 'GET') {
      await handleSignalCheck(req, res);
    } else if (urlPath === '/ping-exchanges' && req.method === 'GET') {
      await handlePingExchanges(req, res);
    } else if (urlPath === '/balance' && req.method === 'POST') {
      await handleBalance(req, res);
    } else if (urlPath === '/place-order' && req.method === 'POST') {
      await handlePlaceOrder(req, res);
    } else {
      sendJSON(res, 404, { error: 'Not found', availableEndpoints: [
        'GET /health',
        'GET /status',
        'GET /state',
        'GET /logs?lines=50',
        'POST /control',
        'GET /signal-check',
        'GET /ping-exchanges',
        'POST /balance',
        'POST /place-order'
      ]});
    }
  } catch (err) {
    console.error('Server error:', err);
    sendJSON(res, 500, { error: err.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(\`Bot Control API listening on port \${PORT}\`);
  console.log('Endpoints:');
  console.log('  GET  /health         - Health check');
  console.log('  GET  /status         - Bot and system status');
  console.log('  GET  /state          - Strategy state');
  console.log('  GET  /logs           - Recent logs');
  console.log('  POST /control        - Start/stop/restart bot (creates START_SIGNAL)');
  console.log('  GET  /signal-check   - Verify START_SIGNAL exists');
  console.log('  GET  /ping-exchanges - Test exchange latency');
  console.log('  POST /balance        - Fetch exchange balance');
  console.log('  POST /place-order    - Execute trade');
});
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { ip } = body;

    // Get VPS IP - either from request or from database
    let targetIp = ip;
    if (!targetIp) {
      // Get the first running VPS instance
      const { data: instances } = await supabase
        .from("vps_instances")
        .select("ip_address")
        .eq("status", "running")
        .limit(1);
      
      if (instances && instances.length > 0) {
        targetIp = instances[0].ip_address;
      }
    }

    if (!targetIp) {
      return new Response(
        JSON.stringify({ success: false, error: "No VPS IP provided and no running instances found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log(`[push-bot-api-update] Updating VPS at ${targetIp}`);

    // Get SSH private key from secrets
    const sshPrivateKey = Deno.env.get("VULTR_SSH_PRIVATE_KEY");
    if (!sshPrivateKey) {
      return new Response(
        JSON.stringify({ success: false, error: "VULTR_SSH_PRIVATE_KEY not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // The script to run on the VPS - writes new index.js and restarts service
    const escapedCode = NEW_INDEX_JS.replace(/'/g, "'\\''");
    const updateScript = `
      set -e
      
      # Stop the service
      echo "Stopping bot-control-api service..."
      systemctl stop bot-control-api 2>/dev/null || true
      
      # Backup current file
      echo "Creating backup..."
      if [ -f /opt/bot-control-api/index.js ]; then
        cp /opt/bot-control-api/index.js /opt/bot-control-api/index.js.bak.$(date +%s)
      fi
      
      # Write new file
      echo "Writing new index.js..."
      mkdir -p /opt/bot-control-api
      cat > /opt/bot-control-api/index.js << 'ENDOFFILE'
${NEW_INDEX_JS}
ENDOFFILE
      
      # Restart service
      echo "Restarting bot-control-api service..."
      systemctl restart bot-control-api
      
      # Wait and verify
      sleep 2
      curl -s http://localhost:3000/health
    `;

    // Call ssh-command edge function to execute the update
    const { data: sshResult, error: sshError } = await supabase.functions.invoke("ssh-command", {
      body: {
        ip: targetIp,
        command: updateScript,
        timeout: 60000,
      },
    });

    if (sshError) {
      console.error("[push-bot-api-update] SSH error:", sshError);
      return new Response(
        JSON.stringify({ success: false, error: sshError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Verify the update by checking health endpoint
    let healthCheck = null;
    try {
      const healthRes = await fetch(`http://${targetIp}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      if (healthRes.ok) {
        healthCheck = await healthRes.json();
      }
    } catch (e) {
      console.log("[push-bot-api-update] Health check failed:", e);
    }

    console.log("[push-bot-api-update] Update complete:", sshResult);

    return new Response(
      JSON.stringify({
        success: true,
        ip: targetIp,
        sshResult,
        healthCheck,
        message: "VPS API updated successfully",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[push-bot-api-update] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
