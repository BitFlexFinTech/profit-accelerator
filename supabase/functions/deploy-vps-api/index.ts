import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerificationResult {
  success: boolean;
  healthCheck: {
    ok: boolean;
    version?: string;
    error?: string;
  };
  signalCheck: {
    ok: boolean;
    hasEndpoint: boolean;
    error?: string;
  };
  vpsIp?: string;
  provider?: string;
  manualFixCommands?: string;
}

async function getVPSDetails(supabase: any): Promise<{ ip: string; provider: string } | null> {
  // Try hft_deployments first
  const { data: hftData } = await supabase
    .from('hft_deployments')
    .select('ip_address, provider')
    .in('status', ['active', 'running'])
    .not('ip_address', 'is', null)
    .limit(1)
    .single();

  if (hftData?.ip_address) {
    return { ip: hftData.ip_address, provider: hftData.provider };
  }

  // Try vps_instances
  const { data: vpsData } = await supabase
    .from('vps_instances')
    .select('ip_address, provider')
    .eq('status', 'running')
    .not('ip_address', 'is', null)
    .limit(1)
    .single();

  if (vpsData?.ip_address) {
    return { ip: vpsData.ip_address, provider: vpsData.provider };
  }

  // Try vps_config
  const { data: configData } = await supabase
    .from('vps_config')
    .select('outbound_ip, provider')
    .not('outbound_ip', 'is', null)
    .limit(1)
    .single();

  if (configData?.outbound_ip) {
    return { ip: configData.outbound_ip, provider: configData.provider };
  }

  return null;
}

const MANUAL_FIX_SCRIPT = `# SSH to your VPS and run these commands:

cat > /opt/bot-control-api/index.js << 'ENDOFFILE'
const http = require('http');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const PORT = 3000;
const VERSION = '2.0.0';

function sendJSON(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(JSON.stringify(data));
}

async function handleSignalCheck(req, res) {
  const SIGNAL_FILE = '/opt/hft-bot/app/data/START_SIGNAL';
  try {
    const signalExists = fs.existsSync(SIGNAL_FILE);
    let signalData = null, signalAge = null;
    if (signalExists) {
      try { signalData = JSON.parse(fs.readFileSync(SIGNAL_FILE, 'utf8')); signalAge = Math.floor((Date.now() - fs.statSync(SIGNAL_FILE).mtimeMs) / 1000); } catch (e) {}
    }
    let dockerRunning = false;
    try { const { stdout } = await execAsync('docker ps --filter name=hft --format "{{.Status}}" 2>/dev/null | head -1'); dockerRunning = stdout.trim().toLowerCase().includes('up'); } catch (e) {}
    sendJSON(res, 200, { signalExists, signalData, signalAgeSeconds: signalAge, dockerRunning, timestamp: new Date().toISOString() });
  } catch (err) { sendJSON(res, 500, { success: false, error: err.message }); }
}

async function handleControl(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { action } = body ? JSON.parse(body) : {};
      if (!['start', 'stop', 'restart'].includes(action)) return sendJSON(res, 400, { success: false, error: 'Invalid action' });
      const SIGNAL_FILE = '/opt/hft-bot/app/data/START_SIGNAL';
      const BOT_DIR = '/opt/hft-bot';
      if (action === 'start' || action === 'restart') {
        try { await execAsync('mkdir -p /opt/hft-bot/app/data'); } catch (e) {}
        fs.writeFileSync(SIGNAL_FILE, JSON.stringify({ started_at: new Date().toISOString(), source: 'dashboard', action }));
        try { if (action === 'restart') await execAsync('cd ' + BOT_DIR + ' && docker compose down 2>/dev/null || true'); await execAsync('cd ' + BOT_DIR + ' && docker compose up -d --remove-orphans'); } catch (e) {}
        return sendJSON(res, 200, { success: true, action, signalCreated: fs.existsSync(SIGNAL_FILE), status: 'active', timestamp: new Date().toISOString() });
      }
      if (action === 'stop') {
        try { if (fs.existsSync(SIGNAL_FILE)) fs.unlinkSync(SIGNAL_FILE); } catch (e) {}
        try { await execAsync('cd ' + BOT_DIR + ' && docker compose down 2>/dev/null || true'); } catch (e) {}
        return sendJSON(res, 200, { success: true, action: 'stop', signalCreated: false, status: 'stopped', timestamp: new Date().toISOString() });
      }
    } catch (err) { sendJSON(res, 500, { success: false, error: err.message }); }
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }
  const url = new URL(req.url, 'http://' + req.headers.host);
  console.log('[' + new Date().toISOString() + '] ' + req.method + ' ' + url.pathname);
  if (url.pathname === '/health') return sendJSON(res, 200, { ok: true, version: VERSION, uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
  if (url.pathname === '/signal-check') return handleSignalCheck(req, res);
  if (url.pathname === '/status') { try { const { stdout } = await execAsync('docker ps --format "{{.Names}}: {{.Status}}"').catch(() => ({ stdout: '' })); sendJSON(res, 200, { success: true, version: VERSION, docker: { containers: stdout.trim().split('\\n').filter(Boolean) }, timestamp: new Date().toISOString() }); } catch (e) { sendJSON(res, 500, { error: e.message }); } return; }
  if (url.pathname === '/control' && req.method === 'POST') return handleControl(req, res);
  if (url.pathname === '/logs') { try { const { stdout } = await execAsync('journalctl -u hft-bot -n 50 --no-pager 2>/dev/null || echo "No logs"'); sendJSON(res, 200, { success: true, logs: stdout.trim().split('\\n') }); } catch (e) { sendJSON(res, 500, { error: e.message }); } return; }
  sendJSON(res, 404, { error: 'Not found', endpoints: ['/health', '/signal-check', '/status', '/control', '/logs'], version: VERSION });
});

server.listen(PORT, '0.0.0.0', () => console.log('VPS Bot Control API v' + VERSION + ' on port ' + PORT));
ENDOFFILE

systemctl restart bot-control-api
curl -sS http://localhost:3000/signal-check`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get VPS details
    const vpsDetails = await getVPSDetails(supabase);
    
    if (!vpsDetails) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No active VPS found in database',
        healthCheck: { ok: false, error: 'No VPS configured' },
        signalCheck: { ok: false, hasEndpoint: false, error: 'No VPS configured' },
      } as VerificationResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const { ip, provider } = vpsDetails;
    const result: VerificationResult = {
      success: false,
      vpsIp: ip,
      provider,
      healthCheck: { ok: false },
      signalCheck: { ok: false, hasEndpoint: false },
    };

    // Check /health endpoint via HTTP
    try {
      const healthController = new AbortController();
      const healthTimeout = setTimeout(() => healthController.abort(), 10000);
      
      const healthResponse = await fetch(`http://${ip}:3000/health`, {
        signal: healthController.signal,
      });
      clearTimeout(healthTimeout);
      
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        result.healthCheck = {
          ok: true,
          version: healthData.version || 'unknown',
        };
      } else {
        result.healthCheck = {
          ok: false,
          error: `HTTP ${healthResponse.status}`,
        };
      }
    } catch (error) {
      result.healthCheck = {
        ok: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }

    // Check /signal-check endpoint via HTTP
    try {
      const signalController = new AbortController();
      const signalTimeout = setTimeout(() => signalController.abort(), 10000);
      
      const signalResponse = await fetch(`http://${ip}:3000/signal-check`, {
        signal: signalController.signal,
      });
      clearTimeout(signalTimeout);
      
      if (signalResponse.ok) {
        const signalData = await signalResponse.json();
        // Check if it's a proper response (has signalExists field) vs 404-like response
        if ('signalExists' in signalData) {
          result.signalCheck = {
            ok: true,
            hasEndpoint: true,
          };
        } else {
          result.signalCheck = {
            ok: false,
            hasEndpoint: false,
            error: 'Endpoint exists but returns invalid response',
          };
        }
      } else if (signalResponse.status === 404) {
        result.signalCheck = {
          ok: false,
          hasEndpoint: false,
          error: 'Endpoint not found (404) - API needs update',
        };
      } else {
        result.signalCheck = {
          ok: false,
          hasEndpoint: false,
          error: `HTTP ${signalResponse.status}`,
        };
      }
    } catch (error) {
      result.signalCheck = {
        ok: false,
        hasEndpoint: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }

    // Determine overall success
    result.success = result.healthCheck.ok && result.signalCheck.ok;

    // If not successful, include manual fix commands
    if (!result.success) {
      result.manualFixCommands = MANUAL_FIX_SCRIPT;
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Verification error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      healthCheck: { ok: false, error: 'Verification failed' },
      signalCheck: { ok: false, hasEndpoint: false, error: 'Verification failed' },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
