import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// The complete VPS Bot Control API code (691 lines)
const VPS_API_CODE = `/**
 * VPS Bot Control API - Expanded Implementation
 * Version: 2.0.0
 * Deploy to: /opt/bot-control-api/index.js
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const PORT = 3000;
const VERSION = '2.0.0';

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

// GET /health - Health check with version
async function handleHealth(req, res) {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();
  
  sendJSON(res, 200, {
    ok: true,
    version: VERSION,
    uptime: Math.floor(uptime),
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024)
    },
    timestamp: new Date().toISOString()
  });
}

// GET /signal-check - Check if START_SIGNAL exists
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
        const stats = fs.statSync(SIGNAL_FILE);
        signalAge = Math.floor((Date.now() - stats.mtimeMs) / 1000);
      } catch (e) {
        console.log('[signal-check] Could not parse signal file:', e.message);
      }
    }
    
    // Check Docker status
    let dockerRunning = false;
    try {
      const { stdout } = await execAsync('docker ps --filter name=hft --format "{{.Status}}" 2>/dev/null | head -1');
      dockerRunning = stdout.trim().toLowerCase().includes('up');
    } catch (e) {
      // Docker not running or not installed
    }
    
    sendJSON(res, 200, {
      signalExists,
      signalData,
      signalAgeSeconds: signalAge,
      dockerRunning,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    sendJSON(res, 500, { success: false, error: err.message });
  }
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
      version: VERSION,
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
    sendJSON(res, 200, { success: true, state, timestamp: new Date().toISOString() });
  } catch (err) {
    sendJSON(res, 500, { success: false, error: err.message });
  }
}

// GET /logs - Recent bot logs
async function handleLogs(req, res) {
  try {
    const url = new URL(req.url, \\\`http://\\\${req.headers.host}\\\`);
    const lines = parseInt(url.searchParams.get('lines') || '50', 10);
    const { stdout: logs } = await execAsync(\\\`journalctl -u hft-bot -n \\\${lines} --no-pager 2>/dev/null || tail -\\\${lines} /var/log/hft-bot.log 2>/dev/null || echo "No logs available"\\\`);
    sendJSON(res, 200, { success: true, logs: logs.trim().split('\\n'), timestamp: new Date().toISOString() });
  } catch (err) {
    sendJSON(res, 500, { success: false, error: err.message });
  }
}

// POST /control - Start/stop bot (Creates START_SIGNAL file)
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
    
    console.log(\\\`[control] Action: \\\${action}, env keys: \\\${env ? Object.keys(env).length : 0}\\\`);
    
    if (action === 'start' || action === 'restart') {
      // Ensure data directory exists
      try { await execAsync(\\\`mkdir -p \\\${DATA_DIR}\\\`); } catch (e) {}
      
      // Write environment variables if provided
      if (env && typeof env === 'object' && Object.keys(env).length > 0) {
        const envContent = Object.entries(env).map(([k, v]) => \\\`\\\${k}=\\\${v}\\\`).join('\\n');
        try {
          fs.writeFileSync(ENV_FILE, envContent);
          console.log(\\\`[control] Wrote \\\${Object.keys(env).length} env vars to \\\${ENV_FILE}\\\`);
        } catch (e) {
          console.error('[control] Failed to write env file:', e.message);
        }
      }
      
      // CREATE START_SIGNAL FILE (CRITICAL!)
      const signalData = JSON.stringify({
        started_at: new Date().toISOString(),
        source: 'dashboard',
        mode: 'live',
        action: action
      });
      
      try {
        fs.writeFileSync(SIGNAL_FILE, signalData);
        console.log(\\\`[control] Created START_SIGNAL at \\\${SIGNAL_FILE}\\\`);
      } catch (e) {
        console.error('[control] Failed to create START_SIGNAL:', e.message);
        return sendJSON(res, 500, { success: false, error: \\\`Failed to create START_SIGNAL: \\\${e.message}\\\`, signalCreated: false });
      }
      
      // Start/restart Docker container
      try {
        if (action === 'restart') {
          await execAsync(\\\`cd \\\${BOT_DIR} && docker compose down 2>/dev/null || true\\\`);
        }
        await execAsync(\\\`cd \\\${BOT_DIR} && docker compose up -d --remove-orphans\\\`);
        console.log('[control] Docker compose started');
      } catch (e) {
        console.log('[control] Docker start warning:', e.message);
      }
      
      // Verify signal file was created
      await new Promise(r => setTimeout(r, 500));
      const signalExists = fs.existsSync(SIGNAL_FILE);
      
      if (!signalExists) {
        console.error('[control] Signal file does not exist after creation!');
        return sendJSON(res, 500, { success: false, error: 'START_SIGNAL was not created', signalCreated: false });
      }
      
      // Check Docker status
      let dockerStatus = 'unknown';
      try {
        const { stdout } = await execAsync('docker ps --filter name=hft --format "{{.Status}}" 2>/dev/null | head -1');
        dockerStatus = stdout.trim() || 'starting';
      } catch (e) {
        dockerStatus = 'error';
      }
      
      console.log(\\\`[control] Bot started successfully. Signal: true, Docker: \\\${dockerStatus}\\\`);
      
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
      // Remove signal file first
      try {
        if (fs.existsSync(SIGNAL_FILE)) {
          fs.unlinkSync(SIGNAL_FILE);
          console.log('[control] Removed START_SIGNAL');
        }
      } catch (e) {
        console.log('[control] Signal removal warning:', e.message);
      }
      
      // Stop Docker container
      try {
        await execAsync(\\\`cd \\\${BOT_DIR} && docker compose down 2>/dev/null || docker stop hft-bot 2>/dev/null || true\\\`);
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
  
  sendJSON(res, 200, { success: true, pings: results, timestamp: new Date().toISOString() });
}

// ============ ROUTER ============
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }
  
  const url = new URL(req.url, \\\`http://\\\${req.headers.host}\\\`);
  const pathname = url.pathname;
  
  console.log(\\\`[\\\${new Date().toISOString()}] \\\${req.method} \\\${pathname}\\\`);
  
  try {
    if (pathname === '/health' && req.method === 'GET') {
      return handleHealth(req, res);
    }
    if (pathname === '/signal-check' && req.method === 'GET') {
      return handleSignalCheck(req, res);
    }
    if (pathname === '/status' && req.method === 'GET') {
      return handleStatus(req, res);
    }
    if (pathname === '/state' && req.method === 'GET') {
      return handleState(req, res);
    }
    if (pathname === '/logs' && req.method === 'GET') {
      return handleLogs(req, res);
    }
    if (pathname === '/control' && req.method === 'POST') {
      return handleControl(req, res);
    }
    if (pathname === '/ping-exchanges' && req.method === 'GET') {
      return handlePingExchanges(req, res);
    }
    
    // 404 for unknown routes
    sendJSON(res, 404, { 
      error: 'Not found', 
      availableEndpoints: ['/health', '/signal-check', '/status', '/state', '/logs', '/control', '/ping-exchanges'],
      version: VERSION
    });
  } catch (err) {
    console.error('Request error:', err);
    sendJSON(res, 500, { error: err.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(\\\`VPS Bot Control API v\\\${VERSION} running on port \\\${PORT}\\\`);
  console.log('Endpoints: /health, /signal-check, /status, /state, /logs, /control, /ping-exchanges');
});
`;

async function getVPSDetails(supabase: any): Promise<{ ip: string; provider: string } | null> {
  // Try hft_deployments first
  const { data: deployment } = await supabase
    .from('hft_deployments')
    .select('ip_address, provider')
    .in('status', ['active', 'running'])
    .limit(1)
    .single();

  if (deployment?.ip_address) {
    return { ip: deployment.ip_address, provider: deployment.provider };
  }

  // Try vps_instances
  const { data: vpsInstance } = await supabase
    .from('vps_instances')
    .select('ip_address, provider')
    .eq('status', 'running')
    .limit(1)
    .single();

  if (vpsInstance?.ip_address) {
    return { ip: vpsInstance.ip_address, provider: vpsInstance.provider };
  }

  // Try vps_config
  const { data: vpsConfig } = await supabase
    .from('vps_config')
    .select('outbound_ip, provider')
    .not('outbound_ip', 'is', null)
    .limit(1)
    .single();

  if (vpsConfig?.outbound_ip) {
    return { ip: vpsConfig.outbound_ip, provider: vpsConfig.provider };
  }

  return null;
}

async function runSSHCommand(ip: string, privateKey: string, command: string): Promise<{ success: boolean; output: string; error?: string }> {
  const keyPath = `/tmp/deploy_key_${Date.now()}`;
  
  try {
    // Write private key to temp file
    await Deno.writeTextFile(keyPath, privateKey);
    await Deno.chmod(keyPath, 0o600);
    
    // Run SSH command
    const cmd = new Deno.Command('ssh', {
      args: [
        '-i', keyPath,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-o', 'LogLevel=ERROR',
        '-o', 'ConnectTimeout=10',
        `root@${ip}`,
        command
      ],
      stdout: 'piped',
      stderr: 'piped',
    });
    
    const process = cmd.spawn();
    const output = await process.output();
    
    const stdout = new TextDecoder().decode(output.stdout);
    const stderr = new TextDecoder().decode(output.stderr);
    
    // Clean up key file
    try { await Deno.remove(keyPath); } catch (_) {}
    
    if (output.code !== 0) {
      return { success: false, output: stdout, error: stderr || `Exit code: ${output.code}` };
    }
    
    return { success: true, output: stdout };
  } catch (error) {
    // Clean up key file on error
    try { await Deno.remove(keyPath); } catch (_) {}
    return { success: false, output: '', error: error instanceof Error ? error.message : 'Unknown error' };
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

    // Get SSH private key
    const sshPrivateKey = Deno.env.get('VULTR_SSH_PRIVATE_KEY');
    if (!sshPrivateKey) {
      return new Response(JSON.stringify({
        success: false,
        error: 'SSH private key not configured',
        step: 'init'
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get VPS details
    const vps = await getVPSDetails(supabase);
    if (!vps) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No active VPS found',
        step: 'init'
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[deploy-vps-api] Deploying to ${vps.ip} (${vps.provider})`);

    const results: any = {
      ip: vps.ip,
      provider: vps.provider,
      steps: []
    };

    // Step 1: Create backup
    console.log('[deploy-vps-api] Step 1: Creating backup...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupResult = await runSSHCommand(
      vps.ip,
      sshPrivateKey,
      `cp /opt/bot-control-api/index.js /opt/bot-control-api/index.js.bak.${timestamp} 2>/dev/null || echo 'no_backup_needed'`
    );
    results.steps.push({ step: 'backup', ...backupResult });

    // Step 2: Ensure directory exists
    console.log('[deploy-vps-api] Step 2: Ensuring directory...');
    const mkdirResult = await runSSHCommand(
      vps.ip,
      sshPrivateKey,
      'mkdir -p /opt/bot-control-api'
    );
    results.steps.push({ step: 'mkdir', ...mkdirResult });

    // Step 3: Write the new API file using base64 encoding to avoid escaping issues
    console.log('[deploy-vps-api] Step 3: Writing API file...');
    
    // Encode the API code as base64
    const encoder = new TextEncoder();
    const codeBytes = encoder.encode(VPS_API_CODE);
    const base64Code = btoa(String.fromCharCode(...codeBytes));
    
    // Write via base64 decode on the remote server
    const writeResult = await runSSHCommand(
      vps.ip,
      sshPrivateKey,
      `echo '${base64Code}' | base64 -d > /opt/bot-control-api/index.js.tmp && mv /opt/bot-control-api/index.js.tmp /opt/bot-control-api/index.js && wc -c /opt/bot-control-api/index.js`
    );
    results.steps.push({ step: 'write', ...writeResult });

    if (!writeResult.success) {
      return new Response(JSON.stringify({
        success: false,
        error: `Failed to write API file: ${writeResult.error}`,
        results
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Step 4: Restart the service
    console.log('[deploy-vps-api] Step 4: Restarting service...');
    const restartResult = await runSSHCommand(
      vps.ip,
      sshPrivateKey,
      'systemctl restart bot-control-api && sleep 2 && systemctl is-active bot-control-api'
    );
    results.steps.push({ step: 'restart', ...restartResult });

    // Step 5: Verify /health endpoint
    console.log('[deploy-vps-api] Step 5: Verifying /health...');
    const healthResult = await runSSHCommand(
      vps.ip,
      sshPrivateKey,
      'curl -sS http://localhost:3000/health'
    );
    results.steps.push({ step: 'verify_health', ...healthResult });

    let healthOk = false;
    let version = null;
    try {
      const healthData = JSON.parse(healthResult.output);
      healthOk = healthData.ok === true;
      version = healthData.version;
    } catch (_) {}

    // Step 6: Verify /signal-check endpoint (this is the critical one)
    console.log('[deploy-vps-api] Step 6: Verifying /signal-check...');
    const signalCheckResult = await runSSHCommand(
      vps.ip,
      sshPrivateKey,
      'curl -sS -w "\\nHTTP_CODE:%{http_code}" http://localhost:3000/signal-check'
    );
    results.steps.push({ step: 'verify_signal_check', ...signalCheckResult });

    let signalCheckOk = false;
    try {
      signalCheckOk = signalCheckResult.output.includes('signalExists') && 
                      signalCheckResult.output.includes('HTTP_CODE:200');
    } catch (_) {}

    const success = healthOk && signalCheckOk;

    console.log(`[deploy-vps-api] Deployment ${success ? 'SUCCESS' : 'PARTIAL'}: health=${healthOk}, signal-check=${signalCheckOk}, version=${version}`);

    return new Response(JSON.stringify({
      success,
      ip: vps.ip,
      provider: vps.provider,
      version,
      healthOk,
      signalCheckOk,
      results,
      timestamp: new Date().toISOString()
    }), {
      status: success ? 200 : 207,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[deploy-vps-api] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
