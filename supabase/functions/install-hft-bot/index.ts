import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INSTALL_SCRIPT = `#!/bin/bash
set -euo pipefail

# Fail fast with clear diagnostics (no silent exits)
trap 'code=$?; echo ""; echo -e "\\033[0;31m[ERROR]\\033[0m Installer failed at line $LINENO: $BASH_COMMAND"; echo -e "\\033[0;31m[ERROR]\\033[0m Exit code: $code"; echo ""; exit $code' ERR

# Get server IP dynamically
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          🐟 PROFIT PIRANHA - HFT Trading Bot               ║"
echo "║          Server IP: \$SERVER_IP                             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
CYAN='\\033[0;36m'
NC='\\033[0m'

log_info() { echo -e "\${GREEN}[INFO]\${NC} $1"; }
log_warn() { echo -e "\${YELLOW}[WARN]\${NC} $1"; }
log_error() { echo -e "\${RED}[ERROR]\${NC} $1"; }
log_piranha() { echo -e "\${CYAN}[🐟 PIRANHA]\${NC} $1"; }

# Check root
if [ "$EUID" -ne 0 ]; then
  log_error "Please run as root: sudo bash"
  exit 1
fi

log_info "Starting Profit Piranha installation..."
log_info "Detected Server IP: \$SERVER_IP"

# System updates
log_info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# Install base dependencies (NO docker.io or docker-compose from Ubuntu)
log_info "Installing base dependencies..."
apt-get install -y -qq curl wget htop net-tools jq ufw fail2ban ca-certificates gnupg lsb-release iptables

# ============================================================================
# SELF-HEALING DOCKER INSTALLATION
# ============================================================================

# Function: Check if Docker daemon is healthy
docker_is_healthy() {
  docker info >/dev/null 2>&1
}

# Function: Print Docker diagnostics
print_docker_diagnostics() {
  log_warn "Docker diagnostics:"
  echo "--- systemctl status docker ---"
  systemctl status docker --no-pager -l 2>&1 || true
  echo ""
  echo "--- journalctl -u docker (last 50 lines) ---"
  journalctl -u docker --no-pager -n 50 2>&1 || true
  echo ""
  echo "--- docker info ---"
  docker info 2>&1 || true
  echo ""
}

# Function: Apply kernel modules and sysctl fixes
apply_kernel_fixes() {
  log_info "Applying kernel module and sysctl fixes..."
  modprobe overlay 2>/dev/null || true
  modprobe br_netfilter 2>/dev/null || true
  
  # Ensure sysctl settings persist
  cat > /etc/sysctl.d/99-docker.conf << 'SYSCTL_EOF'
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward = 1
SYSCTL_EOF
  
  sysctl --system >/dev/null 2>&1 || true
  sysctl -w net.bridge.bridge-nf-call-iptables=1 2>/dev/null || true
  sysctl -w net.bridge.bridge-nf-call-ip6tables=1 2>/dev/null || true
  sysctl -w net.ipv4.ip_forward=1 2>/dev/null || true
}

# Function: Fix iptables for Docker compatibility
fix_iptables() {
  log_info "Fixing iptables configuration..."
  # Ensure iptables uses nft backend (Ubuntu 24.04+)
  update-alternatives --set iptables /usr/sbin/iptables-nft 2>/dev/null || true
  update-alternatives --set ip6tables /usr/sbin/ip6tables-nft 2>/dev/null || true
  
  # Flush any conflicting rules that might block Docker
  iptables -F DOCKER 2>/dev/null || true
  iptables -t nat -F DOCKER 2>/dev/null || true
}

# Function: Reset Docker state completely
reset_docker_state() {
  log_info "Resetting Docker state..."
  systemctl stop docker.socket 2>/dev/null || true
  systemctl stop docker 2>/dev/null || true
  systemctl stop containerd 2>/dev/null || true
  
  rm -rf /var/lib/docker 2>/dev/null || true
  rm -rf /var/lib/containerd 2>/dev/null || true
  rm -rf /var/run/docker.sock 2>/dev/null || true
  rm -rf /var/run/docker 2>/dev/null || true
  
  # Backup and remove daemon.json if it exists
  if [ -f /etc/docker/daemon.json ]; then
    mv /etc/docker/daemon.json /etc/docker/daemon.json.bak.\$(date +%s) 2>/dev/null || true
  fi
}

# Function: Attempt to start Docker daemon
start_docker_daemon() {
  log_info "Starting Docker daemon..."
  systemctl daemon-reload
  systemctl enable docker.socket 2>/dev/null || true
  systemctl enable containerd 2>/dev/null || true
  systemctl enable docker
  
  systemctl start containerd 2>/dev/null || true
  sleep 2
  systemctl start docker
  sleep 3
}

# Function: Try to start Docker with remediation
start_docker_with_remediation() {
  local attempt=1
  local max_attempts=4
  
  while [ \$attempt -le \$max_attempts ]; do
    log_info "Docker start attempt \$attempt/\$max_attempts..."
    
    # Try to start Docker
    start_docker_daemon 2>/dev/null || true
    
    # Check if healthy
    if docker_is_healthy; then
      log_info "✅ Docker daemon is healthy!"
      return 0
    fi
    
    log_warn "Docker not healthy, applying remediation \$attempt..."
    
    case \$attempt in
      1)
        # First: Apply kernel fixes
        apply_kernel_fixes
        ;;
      2)
        # Second: Fix iptables
        fix_iptables
        apply_kernel_fixes
        ;;
      3)
        # Third: Reset Docker state completely
        reset_docker_state
        apply_kernel_fixes
        fix_iptables
        ;;
      4)
        # Fourth: Full nuclear option
        log_warn "Attempting full Docker reinstall..."
        apt-get remove -y --purge docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin 2>/dev/null || true
        reset_docker_state
        apt-get update -qq
        apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        apply_kernel_fixes
        fix_iptables
        ;;
    esac
    
    attempt=\$((attempt + 1))
    sleep 2
  done
  
  return 1
}

# Remove any legacy Docker installations to prevent conflicts
log_info "Removing legacy Docker packages..."
systemctl stop docker.socket 2>/dev/null || true
systemctl stop docker 2>/dev/null || true
systemctl stop containerd 2>/dev/null || true
apt-get remove -y docker docker.io docker-compose docker-compose-v2 containerd runc 2>/dev/null || true
rm -rf /var/lib/docker /var/lib/containerd 2>/dev/null || true
rm -f /etc/apt/sources.list.d/docker.list 2>/dev/null || true
rm -f /etc/apt/keyrings/docker.gpg 2>/dev/null || true
apt-get autoremove -y -qq 2>/dev/null || true

# Apply kernel fixes BEFORE installing Docker
apply_kernel_fixes

# Install Docker from OFFICIAL Docker repository (includes Compose V2)
log_info "Installing Docker from official Docker repository..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \$(lsb_release -cs) stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -qq
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verify Docker Compose V2 is installed
log_info "Verifying Docker installation..."
docker --version
docker compose version || {
  log_error "Docker Compose V2 installation failed!"
  exit 1
}

# Use Docker Compose V2 (docker compose, not docker-compose)
COMPOSE="docker compose"
log_info "Using: \$COMPOSE"

# ============================================================================
# START DOCKER WITH SELF-HEALING REMEDIATION
# ============================================================================
log_info "Starting Docker with self-healing remediation..."

if ! start_docker_with_remediation; then
  log_error "❌ Docker daemon failed to start after all remediation attempts!"
  echo ""
  print_docker_diagnostics
  echo ""
  log_error "Please check the diagnostics above and report the issue."
  log_error "Common causes: incompatible kernel, missing virtualization, or VPS restrictions."
  exit 1
fi

# HARD GATE: Verify Docker is truly working before proceeding
log_info "Final Docker health verification..."
if ! docker_is_healthy; then
  log_error "❌ Docker daemon is not running! Cannot proceed."
  print_docker_diagnostics
  exit 1
fi

# Verify we can actually run containers
log_info "Testing Docker container execution..."
if ! docker run --rm hello-world >/dev/null 2>&1; then
  log_warn "Docker hello-world test failed, but daemon is running. Proceeding..."
fi

log_info "✅ Docker is fully operational!"

# Create HFT directory structure
log_info "Creating directory structure..."
mkdir -p /opt/hft-bot/{app,logs,config,data,strategies}
cd /opt/hft-bot

# Create docker-compose.yml with SUPERVISOR for reliable multi-process management
log_info "Creating Docker configuration with supervisor..."
cat > docker-compose.yml << 'COMPOSE_EOF'
version: '3.8'
services:
  hft-bot:
    image: node:20-alpine
    container_name: hft-bot
    working_dir: /app
    env_file:
      - .env.exchanges
    volumes:
      - ./app:/app
      - ./logs:/app/logs
      - ./config:/app/config
      - ./data:/app/data
      - ./strategies:/app/strategies
    environment:
      - NODE_ENV=production
      - TZ=Asia/Tokyo
      - STRATEGY_NAME=profit-piranha
      - MIN_POSITION_SIZE=350
      - MAX_POSITION_SIZE=500
      - PROFIT_TARGET_SPOT=1
      - PROFIT_TARGET_LEVERAGE=3
    restart: always
    network_mode: host
    command: ["node", "supervisor.js"]
    
  redis:
    image: redis:alpine
    container_name: hft-redis
    restart: always
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

volumes:
  redis-data:
COMPOSE_EOF

# Create default .env.exchanges file (will be overwritten by bot-control on start)
log_info "Creating default .env.exchanges file..."
cat > .env.exchanges << 'ENVEOF'
STRATEGY_ENABLED=false
TRADE_MODE=SPOT
ENVEOF

# =============================================================================
# CREATE SUPERVISOR.JS - Reliable multi-process manager with auto-restart
# =============================================================================
log_info "Creating process supervisor..."
cat > app/supervisor.js << 'SUPERVISOR_EOF'
const { spawn } = require('child_process');
const fs = require('fs');

console.log('[SUPERVISOR] 🐟 Starting Profit Piranha bot supervisor v2.1...');
console.log('[SUPERVISOR] Time:', new Date().toISOString());

let healthProcess = null;
let strategyProcess = null;
let healthRestarts = 0;
let strategyRestarts = 0;

const MAX_RESTARTS = 50;
const RESTART_DELAY = 2000;

const startHealth = () => {
  if (healthRestarts >= MAX_RESTARTS) {
    console.error('[SUPERVISOR] ❌ health.js exceeded max restarts (' + MAX_RESTARTS + '). Stopping.');
    return;
  }
  
  console.log('[SUPERVISOR] Starting health.js (attempt ' + (healthRestarts + 1) + ')...');
  
  healthProcess = spawn('node', ['health.js'], {
    cwd: '/app',
    stdio: 'inherit',
    env: process.env
  });
  
  healthProcess.on('exit', (code, signal) => {
    healthRestarts++;
    console.error('[SUPERVISOR] ❌ health.js exited | code=' + code + ' signal=' + signal + ' | restarts=' + healthRestarts);
    
    if (healthRestarts < MAX_RESTARTS) {
      console.log('[SUPERVISOR] Restarting health.js in ' + (RESTART_DELAY/1000) + 's...');
      setTimeout(startHealth, RESTART_DELAY);
    }
  });
  
  healthProcess.on('error', (err) => {
    healthRestarts++;
    console.error('[SUPERVISOR] ❌ health.js spawn error:', err.message);
    setTimeout(startHealth, RESTART_DELAY);
  });
};

const startStrategy = () => {
  if (strategyRestarts >= MAX_RESTARTS) {
    console.error('[SUPERVISOR] ❌ strategy.js exceeded max restarts (' + MAX_RESTARTS + '). Stopping.');
    return;
  }
  
  console.log('[SUPERVISOR] Starting strategy.js (attempt ' + (strategyRestarts + 1) + ')...');
  
  strategyProcess = spawn('node', ['strategy.js'], {
    cwd: '/app',
    stdio: 'inherit',
    env: process.env
  });
  
  strategyProcess.on('exit', (code, signal) => {
    strategyRestarts++;
    console.error('[SUPERVISOR] ❌ strategy.js exited | code=' + code + ' signal=' + signal + ' | restarts=' + strategyRestarts);
    
    if (strategyRestarts < MAX_RESTARTS) {
      console.log('[SUPERVISOR] Restarting strategy.js in ' + (RESTART_DELAY/1000) + 's...');
      setTimeout(startStrategy, RESTART_DELAY);
    }
  });
  
  strategyProcess.on('error', (err) => {
    strategyRestarts++;
    console.error('[SUPERVISOR] ❌ strategy.js spawn error:', err.message);
    setTimeout(startStrategy, RESTART_DELAY);
  });
};

// Start both processes
startHealth();
setTimeout(startStrategy, 500); // Slight delay to let health start first

// Graceful shutdown handlers
const shutdown = (signal) => {
  console.log('[SUPERVISOR] Received ' + signal + ', shutting down gracefully...');
  
  if (healthProcess) {
    healthProcess.kill('SIGTERM');
  }
  if (strategyProcess) {
    strategyProcess.kill('SIGTERM');
  }
  
  setTimeout(() => {
    console.log('[SUPERVISOR] Shutdown complete.');
    process.exit(0);
  }, 1000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Keep supervisor alive
setInterval(() => {
  const healthAlive = healthProcess && !healthProcess.killed;
  const strategyAlive = strategyProcess && !strategyProcess.killed;
  console.log('[SUPERVISOR] Status: health=' + (healthAlive ? 'running' : 'stopped') + 
              ' strategy=' + (strategyAlive ? 'running' : 'stopped') + 
              ' | restarts: health=' + healthRestarts + ' strategy=' + strategyRestarts);
}, 60000);

console.log('[SUPERVISOR] ✅ Supervisor initialized. Monitoring health.js and strategy.js...');
SUPERVISOR_EOF

# =============================================================================
# CREATE HEALTH.JS - Health endpoint with enhanced error logging
# =============================================================================
log_info "Creating health check endpoint with balance proxy..."
cat > app/health.js << 'HEALTH_EOF'
const http = require('http');
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
  version: '2.0.0',
  strategy: process.env.STRATEGY_NAME || 'profit-piranha'
});

// HMAC-SHA256 signing for Binance
const signBinance = (query, secret) => {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
};

// Signing for OKX
const signOKX = (timestamp, method, path, body, secret) => {
  const message = timestamp + method + path + body;
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
};

// Fetch Binance balance
const fetchBinanceBalance = async (apiKey, apiSecret) => {
  return new Promise((resolve) => {
    const timestamp = Date.now();
    const query = \`timestamp=\${timestamp}\`;
    const signature = signBinance(query, apiSecret);
    
    const options = {
      hostname: 'api.binance.com',
      path: \`/api/v3/account?\${query}&signature=\${signature}\`,
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

// Fetch OKX balance - BOTH Trading and Funding accounts with proper error handling
const fetchOKXBalance = async (apiKey, apiSecret, passphrase) => {
  let tradingBalance = 0;
  let fundingBalance = 0;
  let lastError = null;
  let authSuccess = false;
  
  // 1. Fetch TRADING account balance
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
    console.log('[OKX] Trading response:', json.code, json.msg || '');
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
  
  // 2. Fetch FUNDING account balance (where deposits typically go!)
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
    console.log('[OKX] Funding response:', json.code, json.msg || '');
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
  console.log('[OKX] Trading: $' + tradingBalance + ', Funding: $' + fundingBalance + ', Total: $' + totalBalance);
  
  // Return error if both endpoints failed
  if (!authSuccess) {
    return { success: false, balance: 0, error: lastError || 'OKX authentication failed' };
  }
  
  return { success: true, balance: totalBalance };
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');

  // Handle CORS preflight
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
  } else if (req.url === '/strategy-status') {
    // Report strategy status
    const fs = require('fs');
    let strategyStatus = { active: false };
    try {
      if (fs.existsSync('/app/data/strategy-state.json')) {
        strategyStatus = JSON.parse(fs.readFileSync('/app/data/strategy-state.json', 'utf8'));
      }
    } catch {}
    res.writeHead(200);
    res.end(JSON.stringify(strategyStatus));
  } else if (req.url === '/balance' && req.method === 'POST') {
    // Balance proxy endpoint - fetch from exchanges using VPS IP
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { exchange, apiKey, apiSecret, passphrase } = JSON.parse(body);
        console.log('[Balance Proxy] Request for:', exchange);
        
        if (exchange === 'binance') {
          const balance = await fetchBinanceBalance(apiKey, apiSecret);
          console.log('[Balance Proxy] Binance result: $' + balance);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, balance, exchange }));
        } else if (exchange === 'okx') {
          const result = await fetchOKXBalance(apiKey, apiSecret, passphrase);
          console.log('[Balance Proxy] OKX result:', JSON.stringify(result));
          res.writeHead(200);
          res.end(JSON.stringify({ ...result, exchange }));
        } else {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Unsupported exchange: ' + exchange }));
        }
      } catch (err) {
        console.error('[Balance Proxy] Error:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: String(err) }));
      }
    });
  } else if (req.url === '/ping-exchanges' && req.method === 'GET') {
    // Ping all major exchanges and measure latency from VPS
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

    console.log('[🐟 PIRANHA] Pinging ' + exchanges.length + ' exchanges...');
    
    const results = await Promise.all(exchanges.map(async (ex) => {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        await new Promise((resolve, reject) => {
          const req = https.get(ex.url, { timeout: 5000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        });
        
        clearTimeout(timeout);
        const latency = Date.now() - start;
        console.log('[🐟 PIRANHA] ' + ex.name + ': ' + latency + 'ms');
        return { exchange: ex.name, latency_ms: latency, status: 'ok' };
      } catch (err) {
        const latency = Date.now() - start;
        console.log('[🐟 PIRANHA] ' + ex.name + ': ERROR - ' + err.message);
        return { exchange: ex.name, latency_ms: latency, status: 'error', error: err.message };
      }
    }));

    res.writeHead(200);
    res.end(JSON.stringify({ success: true, source: 'vps', pings: results }));
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
        
        const fs = require('fs');
        const path = require('path');
        
        // Write new code to temp file first
        const tempPath = '/app/health.js.new';
        const mainPath = '/app/health.js';
        
        console.log('[🐟 PIRANHA] Writing new code to temp file...');
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
        console.log('[🐟 PIRANHA] Replacing health.js...');
        fs.renameSync(tempPath, mainPath);
        
        res.writeHead(200);
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Bot code updated, container will restart',
          version: getMetrics().version
        }));
        
        // Exit process - Docker will auto-restart with new code
        console.log('[🐟 PIRANHA] Exiting for restart with new code...');
        setTimeout(() => process.exit(0), 200);
        
      } catch (err) {
        console.error('[🐟 PIRANHA] Update error:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: String(err) }));
      }
    });
  } else if (req.url === '/place-order' && req.method === 'POST') {
    // ========== VPS-BASED TRADE EXECUTION FOR HFT ==========
    // All trades execute directly from VPS for lowest latency
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const startTime = Date.now();
      try {
        const { exchange, symbol, side, quantity, orderType, price, apiKey, apiSecret, passphrase } = JSON.parse(body);
        console.log('[🐟 PIRANHA] Executing order:', exchange, symbol, side, quantity, orderType);
        
        let result;
        
        if (exchange === 'binance' || exchange === 'Binance') {
          // Binance order execution with HMAC-SHA256 signing
          result = await new Promise((resolve) => {
            const timestamp = Date.now();
            let queryString = \`symbol=\${symbol}&side=\${side.toUpperCase()}&type=\${orderType.toUpperCase()}&quantity=\${quantity}&timestamp=\${timestamp}\`;
            
            if (orderType.toUpperCase() === 'LIMIT' && price) {
              queryString += \`&price=\${price}&timeInForce=GTC\`;
            }
            
            const signature = signBinance(queryString, apiSecret);
            const fullQuery = \`\${queryString}&signature=\${signature}\`;
            
            const postData = fullQuery;
            const options = {
              hostname: 'api.binance.com',
              path: '/api/v3/order',
              method: 'POST',
              headers: {
                'X-MBX-APIKEY': apiKey,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
              }
            };
            
            const req = https.request(options, (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => {
                try {
                  const json = JSON.parse(data);
                  const latency = Date.now() - startTime;
                  console.log('[🐟 PIRANHA] Binance response:', json.status, 'latency:', latency, 'ms');
                  resolve({
                    success: json.orderId ? true : false,
                    orderId: json.orderId,
                    executedPrice: parseFloat(json.price || json.cummulativeQuoteQty / json.executedQty || 0),
                    executedQty: parseFloat(json.executedQty || 0),
                    status: json.status,
                    latencyMs: latency,
                    error: json.msg
                  });
                } catch (e) { 
                  resolve({ success: false, error: data, latencyMs: Date.now() - startTime }); 
                }
              });
            });
            req.on('error', (e) => resolve({ success: false, error: e.message, latencyMs: Date.now() - startTime }));
            req.setTimeout(10000, () => { req.destroy(); resolve({ success: false, error: 'Timeout', latencyMs: Date.now() - startTime }); });
            req.write(postData);
            req.end();
          });
          
        } else if (exchange === 'okx' || exchange === 'OKX') {
          // OKX order execution with OK-ACCESS-SIGN
          result = await new Promise((resolve) => {
            const timestamp = new Date().toISOString();
            const instId = symbol.includes('-') ? symbol : symbol.replace('USDT', '-USDT');
            const orderBody = JSON.stringify({
              instId,
              tdMode: 'cash',
              side: side.toLowerCase(),
              ordType: orderType.toLowerCase() === 'market' ? 'market' : 'limit',
              sz: quantity.toString(),
              ...(price && orderType.toLowerCase() === 'limit' ? { px: price.toString() } : {})
            });
            
            const sign = signOKX(timestamp, 'POST', '/api/v5/trade/order', orderBody, apiSecret);
            
            const options = {
              hostname: 'www.okx.com',
              path: '/api/v5/trade/order',
              method: 'POST',
              headers: {
                'OK-ACCESS-KEY': apiKey,
                'OK-ACCESS-SIGN': sign,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'OK-ACCESS-PASSPHRASE': passphrase || '',
                'Content-Type': 'application/json'
              }
            };
            
            const req = https.request(options, (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => {
                try {
                  const json = JSON.parse(data);
                  const latency = Date.now() - startTime;
                  console.log('[🐟 PIRANHA] OKX response:', json.code, 'latency:', latency, 'ms');
                  resolve({
                    success: json.code === '0',
                    orderId: json.data?.[0]?.ordId,
                    latencyMs: latency,
                    error: json.msg || json.data?.[0]?.sMsg
                  });
                } catch (e) { 
                  resolve({ success: false, error: data, latencyMs: Date.now() - startTime }); 
                }
              });
            });
            req.on('error', (e) => resolve({ success: false, error: e.message, latencyMs: Date.now() - startTime }));
            req.setTimeout(10000, () => { req.destroy(); resolve({ success: false, error: 'Timeout', latencyMs: Date.now() - startTime }); });
            req.write(orderBody);
            req.end();
          });
          
        } else if (exchange === 'bybit' || exchange === 'Bybit') {
          // Bybit order execution
          result = await new Promise((resolve) => {
            const timestamp = Date.now().toString();
            const orderBody = JSON.stringify({
              category: 'spot',
              symbol: symbol,
              side: side.charAt(0).toUpperCase() + side.slice(1).toLowerCase(),
              orderType: orderType.charAt(0).toUpperCase() + orderType.slice(1).toLowerCase(),
              qty: quantity.toString(),
              ...(price && orderType.toLowerCase() === 'limit' ? { price: price.toString() } : {})
            });
            
            const signStr = timestamp + apiKey + '5000' + orderBody;
            const signature = crypto.createHmac('sha256', apiSecret).update(signStr).digest('hex');
            
            const options = {
              hostname: 'api.bybit.com',
              path: '/v5/order/create',
              method: 'POST',
              headers: {
                'X-BAPI-API-KEY': apiKey,
                'X-BAPI-SIGN': signature,
                'X-BAPI-SIGN-TYPE': '2',
                'X-BAPI-TIMESTAMP': timestamp,
                'X-BAPI-RECV-WINDOW': '5000',
                'Content-Type': 'application/json'
              }
            };
            
            const req = https.request(options, (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => {
                try {
                  const json = JSON.parse(data);
                  const latency = Date.now() - startTime;
                  console.log('[🐟 PIRANHA] Bybit response:', json.retCode, 'latency:', latency, 'ms');
                  resolve({
                    success: json.retCode === 0,
                    orderId: json.result?.orderId,
                    latencyMs: latency,
                    error: json.retMsg
                  });
                } catch (e) { 
                  resolve({ success: false, error: data, latencyMs: Date.now() - startTime }); 
                }
              });
            });
            req.on('error', (e) => resolve({ success: false, error: e.message, latencyMs: Date.now() - startTime }));
            req.setTimeout(10000, () => { req.destroy(); resolve({ success: false, error: 'Timeout', latencyMs: Date.now() - startTime }); });
            req.write(orderBody);
            req.end();
          });
          
        } else {
          result = { success: false, error: 'Unsupported exchange: ' + exchange, latencyMs: Date.now() - startTime };
        }
        
        console.log('[🐟 PIRANHA] Order result:', result.success ? 'SUCCESS' : 'FAILED', result.latencyMs + 'ms');
        res.writeHead(200);
        res.end(JSON.stringify(result));
        
      } catch (err) {
        console.error('[🐟 PIRANHA] Order execution error:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: String(err), latencyMs: Date.now() - startTime }));
      }
    });
  } else if (req.url === '/control' && req.method === 'POST') {
    // ========== BOT CONTROL ENDPOINT ==========
    // Allows dashboard to start/stop the trading strategy with credentials
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { action, mode, env } = JSON.parse(body);
        const SIGNAL_FILE = '/app/data/START_SIGNAL';
        const ENV_FILE = '/app/data/.env.runtime';
        
        if (action === 'start') {
          // Apply environment variables to process.env if provided
          if (env && typeof env === 'object') {
            Object.keys(env).forEach(key => {
              process.env[key] = env[key];
              console.log('[🐟 PIRANHA] Set env: ' + key + '=' + (key.includes('SECRET') || key.includes('KEY') ? '***' : env[key]));
            });
            
            // Also write to file for strategy.js process to pick up
            // CRITICAL: Use actual newlines, not escaped \\n
            const envFileContent = Object.entries(env)
              .map(([k, v]) => k + '=' + v)
              .join(String.fromCharCode(10));
            require('fs').writeFileSync(ENV_FILE, envFileContent);
            console.log('[🐟 PIRANHA] Wrote ' + Object.keys(env).length + ' env vars to ' + ENV_FILE);
          }
          
          // Create START_SIGNAL with trading mode info (always LIVE)
          const signalData = JSON.stringify({ 
            started_at: new Date().toISOString(),
            source: 'dashboard',
            mode: 'live',
            envCount: env ? Object.keys(env).length : 0
          });
          require('fs').writeFileSync(SIGNAL_FILE, signalData);
          console.log('[🐟 PIRANHA] ✅ START_SIGNAL created - Mode: LIVE');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, action: 'start', mode: 'live', signal_created: true, envVarsLoaded: env ? Object.keys(env).length : 0 }));
        } else if (action === 'stop') {
          if (require('fs').existsSync(SIGNAL_FILE)) {
            require('fs').unlinkSync(SIGNAL_FILE);
          }
          console.log('[🐟 PIRANHA] ⏹️ START_SIGNAL removed');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, action: 'stop', signal_removed: true }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid action. Use "start" or "stop".' }));
        }
      } catch (err) {
        console.error('[🐟 PIRANHA] Control endpoint error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Enhanced error handling for server
server.on('error', (err) => {
  console.error('[🐟 PIRANHA] ❌ Server error:', err.code, err.message);
  if (err.code === 'EADDRINUSE') {
    console.error('[🐟 PIRANHA] ❌ Port 8080 already in use! Exiting for supervisor restart...');
  }
  process.exit(1);
});

server.listen(8080, '0.0.0.0', () => {
  console.log('[🐟 PIRANHA] ✅ Health endpoint listening on 0.0.0.0:8080');
  console.log('[🐟 PIRANHA] ✅ Balance proxy ready');
  console.log('[🐟 PIRANHA] ✅ Control endpoint ready');
});

process.on('SIGTERM', () => {
  console.log('[🐟 PIRANHA] Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('[🐟 PIRANHA] Server closed.');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  console.error('[🐟 PIRANHA] ❌ Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[🐟 PIRANHA] ❌ Unhandled rejection at:', promise, 'reason:', reason);
});

console.log('[🐟 PIRANHA] Health.js initialized, starting server...');
HEALTH_EOF

# Create Profit Piranha Strategy Runner
log_piranha "Creating Profit Piranha strategy runner..."
cat > app/strategy.js << 'STRATEGY_EOF'
/**
 * 🐟 PROFIT PIRANHA - Strategy Runner
 * 
 * A relentless micro-scalping strategy that:
 * - Opens both LONG and SHORT positions
 * - Holds until profit target is reached ($1 spot, $3 leverage)
 * - Never closes at a loss - only at profit
 * - Trades 24/7 continuously
 * - Respects exchange rate limits
 * - Position size: $350-$500
 */

const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

// Load runtime environment file if it exists (written by /control endpoint)
const RUNTIME_ENV_FILE = '/app/data/.env.runtime';
if (fs.existsSync(RUNTIME_ENV_FILE)) {
  try {
    const envContent = fs.readFileSync(RUNTIME_ENV_FILE, 'utf8');
    // Split on actual newlines (LF or CRLF) using replace + split for bash heredoc compat
    envContent.replace(/\r/g, '').split(String.fromCharCode(10)).forEach(line => {
      const idx = line.indexOf('=');
      if (idx > 0) {
        const key = line.substring(0, idx);
        const value = line.substring(idx + 1);
        process.env[key] = value;
      }
    });
    console.log('[🐟 PIRANHA] Loaded runtime environment from ' + RUNTIME_ENV_FILE);
  } catch (err) {
    console.log('[🐟 PIRANHA] Could not load runtime env:', err.message);
  }
}

// ============== CONFIGURATION ==============
const CONFIG = {
  // Position sizing
  MIN_POSITION_SIZE: parseFloat(process.env.MIN_POSITION_SIZE) || 350,
  MAX_POSITION_SIZE: parseFloat(process.env.MAX_POSITION_SIZE) || 500,
  
  // Profit targets (after fees)
  PROFIT_TARGET_SPOT: parseFloat(process.env.PROFIT_TARGET_SPOT) || 1.00,
  PROFIT_TARGET_LEVERAGE: parseFloat(process.env.PROFIT_TARGET_LEVERAGE) || 3.00,
  
  // AI Trading settings
  MAX_CONCURRENT_POSITIONS: 8,  // Maximum 8 concurrent positions
  AI_FETCH_INTERVAL: 1000,      // Fetch AI signals every 1 second
  
  // Trading settings - CRITICAL: NO FALLBACK CREDENTIALS
  ENABLED: process.env.STRATEGY_ENABLED === 'true',
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, // Use service role for secure access
  
  // Telegram alerts (optional)
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || null,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || null,
  
  // Data paths
  STATE_FILE: '/app/data/strategy-state.json',
  TRADES_FILE: '/app/data/trades.json',
  CONFIG_FILE: '/app/config/.env',
};

// CRITICAL: Validate required credentials at startup
if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
  console.error('[🐟 PIRANHA] ❌ FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment');
  console.error('[🐟 PIRANHA] Cannot start without proper Supabase credentials');
  process.exit(1);
}

// Exchange fees (maker/taker as decimal)
const EXCHANGE_FEES = {
  binance: { maker: 0.001, taker: 0.001, type: 'spot' },
  binanceFutures: { maker: 0.0002, taker: 0.0004, type: 'futures' },
  bybit: { maker: 0.0001, taker: 0.0006, type: 'futures' },
  okx: { maker: 0.0002, taker: 0.0005, type: 'both' },
  bitget: { maker: 0.0002, taker: 0.0006, type: 'both' },
  kucoin: { maker: 0.001, taker: 0.001, type: 'spot' },
  mexc: { maker: 0.0, taker: 0.001, type: 'spot' },
  gateio: { maker: 0.002, taker: 0.002, type: 'spot' },
  hyperliquid: { maker: 0.0001, taker: 0.00035, type: 'futures' },
};

// Rate limits per exchange (requests per minute)
const RATE_LIMITS = {
  binance: { rpm: 1200, delay: 50 },
  bybit: { rpm: 120, delay: 500 },
  okx: { rpm: 60, delay: 1000 },
  kucoin: { rpm: 100, delay: 600 },
  bitget: { rpm: 100, delay: 600 },
  mexc: { rpm: 100, delay: 600 },
  gateio: { rpm: 100, delay: 600 },
  hyperliquid: { rpm: 120, delay: 500 },
};

// ============== RATE LIMITER (TOKEN BUCKET) ==============
class RateLimiter {
  constructor(requestsPerMinute) {
    this.tokens = requestsPerMinute;
    this.maxTokens = requestsPerMinute;
    this.lastRefill = Date.now();
    this.queue = [];
  }
  
  async acquire() {
    this.refill();
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    // Wait for next token if none available
    return new Promise(resolve => {
      const waitTime = 60000 / this.maxTokens;
      console.log('[🐟 PIRANHA] ⏳ Rate limit reached, waiting ' + waitTime + 'ms for next token');
      setTimeout(() => {
        this.refill();
        if (this.tokens > 0) this.tokens--;
        resolve(true);
      }, waitTime);
    });
  }
  
  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 60000; // minutes
    const tokensToAdd = elapsed * this.maxTokens;
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
  
  getStatus() {
    this.refill();
    return { tokens: Math.floor(this.tokens), max: this.maxTokens };
  }
}

// Initialize rate limiters for each exchange
const rateLimiters = {
  binance: new RateLimiter(RATE_LIMITS.binance.rpm),
  bybit: new RateLimiter(RATE_LIMITS.bybit.rpm),
  okx: new RateLimiter(RATE_LIMITS.okx.rpm),
  kucoin: new RateLimiter(RATE_LIMITS.kucoin.rpm),
  bitget: new RateLimiter(RATE_LIMITS.bitget.rpm),
  mexc: new RateLimiter(RATE_LIMITS.mexc.rpm),
  gateio: new RateLimiter(RATE_LIMITS.gateio.rpm),
  hyperliquid: new RateLimiter(RATE_LIMITS.hyperliquid.rpm),
};

// Get rate limiter for exchange (with fallback)
function getRateLimiter(exchange) {
  return rateLimiters[exchange.toLowerCase()] || rateLimiters.binance;
}

// ============== TELEGRAM ALERTS ==============
async function sendTelegramAlert(message) {
  if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) return;
  
  try {
    const payload = JSON.stringify({
      chat_id: CONFIG.TELEGRAM_CHAT_ID,
      text: '🐟 PROFIT PIRANHA\\n\\n' + message,
      parse_mode: 'HTML'
    });
    
    const urlParts = new URL('https://api.telegram.org/bot' + CONFIG.TELEGRAM_BOT_TOKEN + '/sendMessage');
    
    return new Promise((resolve) => {
      const options = {
        hostname: urlParts.hostname,
        path: urlParts.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };
      
      const req = https.request(options, (res) => {
        console.log('[🐟 PIRANHA] 📱 Telegram alert sent:', res.statusCode);
        resolve(res.statusCode === 200);
      });
      req.on('error', (e) => {
        console.log('[🐟 PIRANHA] Telegram alert failed:', e.message);
        resolve(false);
      });
      req.write(payload);
      req.end();
    });
  } catch (err) {
    console.log('[🐟 PIRANHA] Telegram error:', err.message);
  }
}

// ============== STATE MANAGEMENT ==============
let state = {
  active: false,
  positions: [],
  totalTrades: 0,
  totalPnL: 0,
  startTime: null,
  lastUpdate: null,
  errors: [],
};

function loadState() {
  try {
    if (fs.existsSync(CONFIG.STATE_FILE)) {
      state = JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
      console.log('[🐟 PIRANHA] Loaded state:', state.positions.length, 'open positions');
    }
  } catch (err) {
    console.error('[🐟 PIRANHA] Failed to load state:', err.message);
  }
}

// ATOMIC STATE WRITES - Prevents corruption on crash
function saveState() {
  try {
    state.lastUpdate = new Date().toISOString();
    const tempFile = CONFIG.STATE_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2));
    fs.renameSync(tempFile, CONFIG.STATE_FILE); // Atomic on POSIX systems
  } catch (err) {
    console.error('[🐟 PIRANHA] Failed to save state:', err.message);
  }
}

// CRITICAL: Reload runtime environment after /control writes credentials
function reloadRuntimeEnv() {
  const RUNTIME_ENV_FILE = '/app/data/.env.runtime';
  if (fs.existsSync(RUNTIME_ENV_FILE)) {
    try {
      const envContent = fs.readFileSync(RUNTIME_ENV_FILE, 'utf8');
      // Split on actual newlines (LF or CRLF) using replace + split for bash heredoc compat
      envContent.replace(/\r/g, '').split(String.fromCharCode(10)).forEach(line => {
        const idx = line.indexOf('=');
        if (idx > 0) {
          const key = line.substring(0, idx);
          const value = line.substring(idx + 1);
          process.env[key] = value;
        }
      });
      console.log('[🐟 PIRANHA] ✅ Reloaded runtime environment from .env.runtime');
      return true;
    } catch (err) {
      console.error('[🐟 PIRANHA] Failed to reload runtime env:', err.message);
      return false;
    }
  }
  console.log('[🐟 PIRANHA] ⚠️ No .env.runtime file found');
  return false;
}

function logTrade(trade) {
  try {
    let trades = [];
    if (fs.existsSync(CONFIG.TRADES_FILE)) {
      trades = JSON.parse(fs.readFileSync(CONFIG.TRADES_FILE, 'utf8'));
    }
    trades.push(trade);
    // Keep last 1000 trades
    if (trades.length > 1000) trades = trades.slice(-1000);
    fs.writeFileSync(CONFIG.TRADES_FILE, JSON.stringify(trades, null, 2));
  } catch (err) {
    console.error('[🐟 PIRANHA] Failed to log trade:', err.message);
  }
}

// ============== UTILITY FUNCTIONS ==============
function calculatePositionSize(availableBalance) {
  if (availableBalance < CONFIG.MIN_POSITION_SIZE) {
    return null; // Insufficient balance
  }
  // Use 95% of balance, capped at max position size
  return Math.min(availableBalance * 0.95, CONFIG.MAX_POSITION_SIZE);
}

function calculateNetPnL(entryPrice, currentPrice, size, side, exchange, isLeverage = false) {
  const fees = EXCHANGE_FEES[exchange] || { maker: 0.001, taker: 0.001 };
  const roundTripFeePercent = fees.maker + fees.taker;
  const roundTripFee = size * roundTripFeePercent;
  
  // Calculate gross P&L based on price movement
  let grossPnL;
  if (side === 'long') {
    grossPnL = ((currentPrice - entryPrice) / entryPrice) * size;
  } else {
    grossPnL = ((entryPrice - currentPrice) / entryPrice) * size;
  }
  
  return grossPnL - roundTripFee;
}

function isProfitTargetReached(netPnL, isLeverage) {
  const target = isLeverage ? CONFIG.PROFIT_TARGET_LEVERAGE : CONFIG.PROFIT_TARGET_SPOT;
  return netPnL >= target;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============== EXCHANGE API HELPERS ==============
function signBinance(query, secret) {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

function signOKX(timestamp, method, path, body, secret) {
  const message = timestamp + method + path + body;
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
}

// Simple price fetcher with RATE LIMIT ENFORCEMENT
async function fetchPrice(exchange, symbol) {
  // Acquire rate limit token before making request
  const limiter = getRateLimiter(exchange);
  await limiter.acquire();
  
  return new Promise((resolve, reject) => {
    let url;
    switch (exchange) {
      case 'binance':
        url = 'https://api.binance.com/api/v3/ticker/price?symbol=' + symbol.replace('/', '');
        break;
      case 'okx':
        url = 'https://www.okx.com/api/v5/market/ticker?instId=' + symbol.replace('/', '-');
        break;
      case 'bybit':
        url = 'https://api.bybit.com/v5/market/tickers?category=spot&symbol=' + symbol.replace('/', '');
        break;
      default:
        resolve(null);
        return;
    }
    
    https.get(url, { timeout: 5000 }, (res) => {
      // Check for rate limit response (429)
      if (res.statusCode === 429) {
        console.log('[🐟 PIRANHA] ⚠️ Exchange rate limit hit for ' + exchange + ', backing off...');
        resolve(null);
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          let price;
          if (exchange === 'binance') {
            price = parseFloat(json.price);
          } else if (exchange === 'okx') {
            price = parseFloat(json.data?.[0]?.last);
          } else if (exchange === 'bybit') {
            price = parseFloat(json.result?.list?.[0]?.lastPrice);
          }
          resolve(price || null);
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// ============== STATISTICAL FALLBACK STRATEGY ==============
// Used when AI signals are unavailable or empty
async function getStatisticalFallbackSignal() {
  console.log('[🐟 PIRANHA] 🔄 AI signals empty, using statistical momentum fallback');
  
  const pairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  for (const symbol of pairs) {
    // Skip if already in position for this symbol
    if (state.positions.some(p => p.symbol === symbol)) continue;
    
    // Collect price samples
    const prices = [];
    for (let i = 0; i < 5; i++) {
      await sleep(200);
      const price = await fetchPrice('binance', symbol.replace('USDT', '/USDT'));
      if (price) prices.push(price);
    }
    
    if (prices.length >= 3) {
      const first = prices[0];
      const last = prices[prices.length - 1];
      const pctChange = ((last - first) / first) * 100;
      
      // Only trade if movement exceeds 0.1% threshold
      if (Math.abs(pctChange) > 0.1) {
        console.log('[🐟 PIRANHA] 📊 Momentum signal found: ' + symbol + ' ' + (pctChange > 0 ? '📈' : '📉') + ' ' + pctChange.toFixed(3) + '%');
        return {
          id: 'fallback-' + Date.now(),
          symbol: symbol,
          exchange_name: 'binance',
          recommended_side: pctChange > 0 ? 'long' : 'short',
          confidence: 65,
          current_price: last,
          profit_timeframe_minutes: 3,
          source: 'statistical_momentum'
        };
      }
    }
  }
  
  console.log('[🐟 PIRANHA] No statistical signal found, waiting for AI...');
  return null;
}

// ============== AI SIGNAL FUNCTIONS ==============

// Fetch high-confidence AI signals from Supabase
async function fetchAIRecommendations() {
  return new Promise((resolve) => {
    const cutoffTime = new Date(Date.now() - 60 * 1000).toISOString();
    const url = CONFIG.SUPABASE_URL + '/rest/v1/ai_market_updates?' +
      'select=id,symbol,exchange_name,sentiment,confidence,current_price,' +
      'profit_timeframe_minutes,recommended_side,expected_move_percent&' +
      'confidence=gte.70&' +
      'created_at=gte.' + encodeURIComponent(cutoffTime) +
      '&order=confidence.desc&limit=10';
    
    https.get(url, {
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const signals = JSON.parse(data);
          if (signals?.length > 0) {
            console.log('[🐟 PIRANHA] Fetched ' + signals.length + ' AI signals (>=70% confidence)');
          }
          resolve(Array.isArray(signals) ? signals : []);
        } catch { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

// Sync trade to Supabase trading_journal - LIVE MODE ONLY
async function recordTradeToSupabase(trade, status) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      exchange: trade.exchange,
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      entry_price: trade.entryPrice,
      exit_price: trade.exitPrice || null,
      pnl: trade.netPnL || null,
      status: status,
      execution_latency_ms: trade.latencyMs || 0,
      ai_reasoning: 'AI Signal: ' + (trade.aiConfidence || 0) + '% confidence | LIVE TRADE',
      // CRITICAL FIX: Set closed_at when status is closed
      closed_at: status === 'closed' ? (trade.exitTime || new Date().toISOString()) : null
    });
    
    const urlParts = new URL(CONFIG.SUPABASE_URL);
    const options = {
      hostname: urlParts.hostname,
      path: '/rest/v1/trading_journal',
      method: 'POST',
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    };
    
    const req = https.request(options, (res) => {
      console.log('[🐟 PIRANHA] Trade synced to Supabase:', status, res.statusCode);
      resolve(res.statusCode === 201);
    });
    req.on('error', (e) => {
      console.log('[🐟 PIRANHA] Trade sync error:', e.message);
      resolve(false);
    });
    req.write(payload);
    req.end();
  });
}

// Update position P&L in Supabase for dashboard visibility (underwater positions)
async function updatePositionPnL(positionId, pnl, currentPrice) {
  if (!positionId) return false;
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      unrealized_pnl: pnl,
      current_price: currentPrice,
      updated_at: new Date().toISOString()
    });
    
    const urlParts = new URL(CONFIG.SUPABASE_URL);
    const options = {
      hostname: urlParts.hostname,
      path: '/rest/v1/positions?id=eq.' + positionId,
      method: 'PATCH',
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    };
    
    const req = https.request(options, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 204);
    });
    req.on('error', () => resolve(false));
    req.write(payload);
    req.end();
  });
}


// Increment live trade counter when LIVE trade closes successfully
async function incrementLiveTradeProgress() {
  return new Promise((resolve) => {
    const urlParts = new URL(CONFIG.SUPABASE_URL);
    const options = {
      hostname: urlParts.hostname,
      path: '/rest/v1/rpc/increment_live_trade',
      method: 'POST',
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      console.log('[🐟 PIRANHA] 💰 Live trade counter incremented, status:', res.statusCode);
      resolve(res.statusCode === 200 || res.statusCode === 204);
    });
    req.on('error', (e) => {
      console.log('[🐟 PIRANHA] Live trade increment error:', e.message);
      resolve(false);
    });
    req.write('{}');
    req.end();
  });
}

// ============== EXCHANGE CREDENTIALS LOADER ==============
function loadExchangeCredentials() {
  return {
    binance: {
      apiKey: process.env.BINANCE_API_KEY || '',
      apiSecret: process.env.BINANCE_API_SECRET || ''
    },
    okx: {
      apiKey: process.env.OKX_API_KEY || '',
      apiSecret: process.env.OKX_API_SECRET || '',
      passphrase: process.env.OKX_PASSPHRASE || ''
    }
  };
}

// Check if credentials are configured for an exchange
function hasCredentials(exchange) {
  const creds = loadExchangeCredentials();
  if (exchange === 'binance') {
    return creds.binance.apiKey && creds.binance.apiSecret;
  }
  if (exchange === 'okx') {
    return creds.okx.apiKey && creds.okx.apiSecret && creds.okx.passphrase;
  }
  return false;
}

// ============== REAL ORDER EXECUTION ==============
async function executeOrder(exchange, symbol, side, quantity, orderType, creds) {
  const startTime = Date.now();
  console.log('[🐟 PIRANHA] 📤 Executing REAL order: ' + exchange + ' ' + symbol + ' ' + side + ' qty=' + quantity);
  
  return new Promise((resolve) => {
    if (exchange === 'binance') {
      // Binance order execution with HMAC-SHA256 signing
      const timestamp = Date.now();
      const binanceSymbol = symbol.replace('/', '').replace('-', '');
      let queryString = 'symbol=' + binanceSymbol + '&side=' + side.toUpperCase() + '&type=' + orderType.toUpperCase() + '&quantity=' + quantity.toFixed(6) + '&timestamp=' + timestamp;
      
      const signature = signBinance(queryString, creds.apiSecret);
      const fullQuery = queryString + '&signature=' + signature;
      
      const options = {
        hostname: 'api.binance.com',
        path: '/api/v3/order',
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': creds.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(fullQuery)
        }
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const latency = Date.now() - startTime;
            console.log('[🐟 PIRANHA] Binance response: status=' + json.status + ' orderId=' + json.orderId + ' latency=' + latency + 'ms');
            
            if (json.orderId) {
              resolve({
                success: true,
                orderId: json.orderId.toString(),
                executedPrice: parseFloat(json.price || json.fills?.[0]?.price || 0),
                executedQty: parseFloat(json.executedQty || quantity),
                status: json.status,
                latencyMs: latency
              });
            } else {
              console.error('[🐟 PIRANHA] ❌ Binance order failed:', json.msg || json.code);
              resolve({ success: false, error: json.msg || 'Order failed', latencyMs: latency });
            }
          } catch (e) {
            resolve({ success: false, error: 'Parse error: ' + data, latencyMs: Date.now() - startTime });
          }
        });
      });
      req.on('error', (e) => resolve({ success: false, error: e.message, latencyMs: Date.now() - startTime }));
      req.setTimeout(10000, () => { req.destroy(); resolve({ success: false, error: 'Timeout', latencyMs: Date.now() - startTime }); });
      req.write(fullQuery);
      req.end();
      
    } else if (exchange === 'okx') {
      // OKX order execution
      const timestamp = new Date().toISOString();
      const instId = symbol.includes('-') ? symbol : symbol.replace('USDT', '-USDT');
      const orderBody = JSON.stringify({
        instId,
        tdMode: 'cash',
        side: side.toLowerCase(),
        ordType: orderType.toLowerCase() === 'market' ? 'market' : 'limit',
        sz: quantity.toFixed(6)
      });
      
      const sign = signOKX(timestamp, 'POST', '/api/v5/trade/order', orderBody, creds.apiSecret);
      
      const options = {
        hostname: 'www.okx.com',
        path: '/api/v5/trade/order',
        method: 'POST',
        headers: {
          'OK-ACCESS-KEY': creds.apiKey,
          'OK-ACCESS-SIGN': sign,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-PASSPHRASE': creds.passphrase || '',
          'Content-Type': 'application/json'
        }
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const latency = Date.now() - startTime;
            console.log('[🐟 PIRANHA] OKX response: code=' + json.code + ' orderId=' + json.data?.[0]?.ordId + ' latency=' + latency + 'ms');
            
            if (json.code === '0' && json.data?.[0]?.ordId) {
              resolve({
                success: true,
                orderId: json.data[0].ordId,
                executedPrice: 0, // OKX doesn't return price immediately for market orders
                executedQty: parseFloat(quantity),
                latencyMs: latency
              });
            } else {
              console.error('[🐟 PIRANHA] ❌ OKX order failed:', json.msg || json.data?.[0]?.sMsg);
              resolve({ success: false, error: json.msg || json.data?.[0]?.sMsg || 'Order failed', latencyMs: latency });
            }
          } catch (e) {
            resolve({ success: false, error: 'Parse error: ' + data, latencyMs: Date.now() - startTime });
          }
        });
      });
      req.on('error', (e) => resolve({ success: false, error: e.message, latencyMs: Date.now() - startTime }));
      req.setTimeout(10000, () => { req.destroy(); resolve({ success: false, error: 'Timeout', latencyMs: Date.now() - startTime }); });
      req.write(orderBody);
      req.end();
      
    } else {
      resolve({ success: false, error: 'Unsupported exchange: ' + exchange, latencyMs: 0 });
    }
  });
}

// ============== SUPABASE ORDER/POSITION SYNC ==============
async function recordOrderToSupabase(order) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      exchange_name: order.exchange,
      symbol: order.symbol,
      side: order.side,
      amount: order.quantity,
      type: order.orderType || 'market',
      price: order.executedPrice || null,
      status: order.status || 'filled',
      exchange_order_id: order.orderId,
      client_order_id: order.clientOrderId || null
    });
    
    const urlParts = new URL(CONFIG.SUPABASE_URL);
    const options = {
      hostname: urlParts.hostname,
      path: '/rest/v1/orders',
      method: 'POST',
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('[🐟 PIRANHA] Order synced to Supabase: ' + res.statusCode);
        try {
          const result = JSON.parse(data);
          resolve(result?.[0]?.id || null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', (e) => { console.log('[🐟 PIRANHA] Order sync error:', e.message); resolve(null); });
    req.write(payload);
    req.end();
  });
}

async function recordPositionToSupabase(position, status) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      exchange_name: position.exchange,
      symbol: position.symbol,
      side: position.side,
      size: position.quantity,
      entry_price: position.entryPrice,
      current_price: position.currentPrice || position.entryPrice,
      unrealized_pnl: position.unrealizedPnL || 0,
      realized_pnl: position.netPnL || null,
      status: status,
      leverage: position.isLeverage ? (position.leverage || 1) : null
    });
    
    const urlParts = new URL(CONFIG.SUPABASE_URL);
    const options = {
      hostname: urlParts.hostname,
      path: '/rest/v1/positions',
      method: 'POST',
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('[🐟 PIRANHA] Position synced to Supabase: ' + res.statusCode);
        try {
          const result = JSON.parse(data);
          resolve(result?.[0]?.id || null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', (e) => { console.log('[🐟 PIRANHA] Position sync error:', e.message); resolve(null); });
    req.write(payload);
    req.end();
  });
}

async function closePositionInSupabase(positionId, exitPrice, realizedPnL) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      status: 'closed',
      current_price: exitPrice,
      realized_pnl: realizedPnL
    });
    
    const urlParts = new URL(CONFIG.SUPABASE_URL);
    const options = {
      hostname: urlParts.hostname,
      path: '/rest/v1/positions?id=eq.' + positionId,
      method: 'PATCH',
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      console.log('[🐟 PIRANHA] Position closed in Supabase: ' + res.statusCode);
      resolve(res.statusCode === 200 || res.statusCode === 204);
    });
    req.on('error', (e) => { console.log('[🐟 PIRANHA] Position close error:', e.message); resolve(false); });
    req.write(payload);
    req.end();
  });
}

// Check risk limits from trading_config
async function checkRiskLimits() {
  return new Promise((resolve) => {
    const urlParts = new URL(CONFIG.SUPABASE_URL);
    const options = {
      hostname: urlParts.hostname,
      path: '/rest/v1/trading_config?select=global_kill_switch_enabled,max_daily_drawdown_percent,max_position_size&limit=1',
      method: 'GET',
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
        'Content-Type': 'application/json'
      }
    };
    
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const configs = JSON.parse(data);
          const config = configs?.[0] || {};
          resolve({
            killSwitchEnabled: config.global_kill_switch_enabled === true,
            maxDailyDrawdown: config.max_daily_drawdown_percent || 10,
            maxPositionSize: config.max_position_size || 500
          });
        } catch {
          resolve({ killSwitchEnabled: false, maxDailyDrawdown: 10, maxPositionSize: 500 });
        }
      });
    }).on('error', () => resolve({ killSwitchEnabled: false, maxDailyDrawdown: 10, maxPositionSize: 500 }));
  });
}

// Get today's total PnL for daily loss check
async function getTodaysPnL() {
  return new Promise((resolve) => {
    const today = new Date().toISOString().split('T')[0];
    const urlParts = new URL(CONFIG.SUPABASE_URL);
    const options = {
      hostname: urlParts.hostname,
      path: '/rest/v1/trading_journal?select=pnl&closed_at=gte.' + today + 'T00:00:00Z',
      method: 'GET',
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
        'Content-Type': 'application/json'
      }
    };
    
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const trades = JSON.parse(data);
          const totalPnL = trades.reduce((sum, t) => sum + (parseFloat(t.pnl) || 0), 0);
          resolve(totalPnL);
        } catch {
          resolve(0);
        }
      });
    }).on('error', () => resolve(0));
  });
}

// Open position based on AI signal - WITH REAL ORDER EXECUTION AND RISK MANAGEMENT
async function openPosition(signal, credentials) {
  const symbol = signal.symbol.includes('USDT') ? signal.symbol : signal.symbol + 'USDT';
  
  // ============== RISK MANAGEMENT CHECKS ==============
  const riskConfig = await checkRiskLimits();
  
  // Check global kill switch
  if (riskConfig.killSwitchEnabled) {
    console.log('[🐟 PIRANHA] ⛔ KILL SWITCH ENABLED - All trading suspended');
    return null;
  }
  
  // Check daily drawdown limit
  const todaysPnL = await getTodaysPnL();
  if (todaysPnL < 0) {
    const currentBalance = 1000; // TODO: Get actual balance
    const drawdownPercent = Math.abs(todaysPnL) / currentBalance * 100;
    if (drawdownPercent >= riskConfig.maxDailyDrawdown) {
      console.log('[🐟 PIRANHA] ⛔ DAILY DRAWDOWN LIMIT HIT: ' + drawdownPercent.toFixed(1) + '% >= ' + riskConfig.maxDailyDrawdown + '%');
      console.log('[🐟 PIRANHA]   Today\\'s PnL: $' + todaysPnL.toFixed(2));
      return null;
    }
  }
  
  // ============== ORIGINAL LOGIC CONTINUES ==============
  
  // SPOT MODE: Skip short signals (user configured spot-only)
  if (signal.recommended_side === 'short') {
    console.log('[🐟 PIRANHA] ⏭️ Skipping SHORT signal - SPOT MODE ONLY');
    console.log('[🐟 PIRANHA]   Symbol: ' + symbol + ' | Confidence: ' + signal.confidence + '%');
    return null;
  }
  
  // Only proceed with LONG signals (BUY for spot)
  const side = 'long';
  const orderSide = 'buy'; // For spot, long = buy
  
  // Check for duplicate position on ANY exchange
  const existingPosition = state.positions.find(p => p.symbol === symbol);
  if (existingPosition) {
    console.log('[🐟 PIRANHA] Already have position in', symbol);
    return null;
  }
  
  // Load credentials
  const creds = loadExchangeCredentials();
  
  // Determine which exchanges to trade on (user selected: BOTH)
  const exchangesToTrade = [];
  if (hasCredentials('binance')) exchangesToTrade.push('binance');
  if (hasCredentials('okx')) exchangesToTrade.push('okx');
  
  if (exchangesToTrade.length === 0) {
    console.log('[🐟 PIRANHA] ❌ No exchange credentials configured! Skipping trade.');
    return null;
  }
  
  // Calculate position size: $350-$500
  const positionSize = Math.min(
    Math.max(CONFIG.MIN_POSITION_SIZE, 500 * 0.95),
    CONFIG.MAX_POSITION_SIZE
  );
  
  // Get current price
  const currentPrice = signal.current_price || await fetchPrice('binance', symbol);
  if (!currentPrice) {
    console.log('[🐟 PIRANHA] Could not get price for', symbol);
    return null;
  }
  
  // Split position across configured exchanges
  const sizePerExchange = positionSize / exchangesToTrade.length;
  const quantityPerExchange = sizePerExchange / currentPrice;
  
  console.log('[🐟 PIRANHA] ═══════════════════════════════════════');
  console.log('[🐟 PIRANHA] 🎯 EXECUTING REAL ENTRY ORDER');
  console.log('[🐟 PIRANHA]   Symbol: ' + symbol);
  console.log('[🐟 PIRANHA]   Side: ' + side.toUpperCase() + ' (BUY)');
  console.log('[🐟 PIRANHA]   Exchanges: ' + exchangesToTrade.join(', ').toUpperCase());
  console.log('[🐟 PIRANHA]   Total Size: $' + positionSize.toFixed(2));
  console.log('[🐟 PIRANHA]   Size/Exchange: $' + sizePerExchange.toFixed(2));
  console.log('[🐟 PIRANHA]   Entry Price: $' + currentPrice.toFixed(4));
  console.log('[🐟 PIRANHA]   Quantity/Exchange: ' + quantityPerExchange.toFixed(6));
  console.log('[🐟 PIRANHA]   AI Confidence: ' + signal.confidence + '%');
  console.log('[🐟 PIRANHA] ═══════════════════════════════════════');
  
  // Execute orders on ALL configured exchanges CONCURRENTLY
  const orderPromises = exchangesToTrade.map(async (exchange) => {
    const exchangeCreds = creds[exchange];
    const result = await executeOrder(exchange, symbol, orderSide, quantityPerExchange, 'market', exchangeCreds);
    return { exchange, ...result };
  });
  
  const orderResults = await Promise.all(orderPromises);
  
  // Process results
  const successfulOrders = orderResults.filter(r => r.success);
  const failedOrders = orderResults.filter(r => !r.success);
  
  if (failedOrders.length > 0) {
    for (const failed of failedOrders) {
      console.error('[🐟 PIRANHA] ❌ Order failed on ' + failed.exchange + ': ' + failed.error);
    }
  }
  
  if (successfulOrders.length === 0) {
    console.error('[🐟 PIRANHA] ❌ ALL ORDERS FAILED - No position opened');
    return null;
  }
  
  // Create positions for successful orders
  const positions = [];
  for (const order of successfulOrders) {
    const position = {
      id: crypto.randomUUID(),
      exchange: order.exchange,
      symbol: symbol,
      side: side,
      size: sizePerExchange,
      quantity: quantityPerExchange,
      entryPrice: order.executedPrice || currentPrice,
      entryTime: new Date().toISOString(),
      isLeverage: false,
      aiSignalId: signal.id,
      aiConfidence: signal.confidence,
      aiTimeframe: signal.profit_timeframe_minutes,
      orderId: order.orderId,
      latencyMs: order.latencyMs
    };
    
    state.positions.push(position);
    positions.push(position);
    
    // Record to Supabase orders table
    await recordOrderToSupabase({
      exchange: order.exchange,
      symbol: symbol,
      side: orderSide,
      quantity: quantityPerExchange,
      orderType: 'market',
      executedPrice: order.executedPrice || currentPrice,
      status: 'filled',
      orderId: order.orderId,
      clientOrderId: position.id
    });
    
    // Record position to Supabase
    const supabasePositionId = await recordPositionToSupabase(position, 'open');
    if (supabasePositionId) {
      position.supabaseId = supabasePositionId;
    }
    
    console.log('[🐟 PIRANHA] ✅ Position opened on ' + order.exchange.toUpperCase() + ' | OrderId: ' + order.orderId + ' | Latency: ' + order.latencyMs + 'ms');
  }
  
  saveState();
  
  // Send Telegram alert
  await sendTelegramAlert('🎯 <b>POSITION OPENED</b>\\n' +
    '📊 ' + symbol + '\\n' +
    '📈 Side: LONG (BUY)\\n' +
    '💰 Size: $' + (sizePerExchange * successfulOrders.length).toFixed(2) + '\\n' +
    '🏦 Exchanges: ' + successfulOrders.map(o => o.exchange.toUpperCase()).join(', ') + '\\n' +
    '🎯 Entry: $' + currentPrice.toFixed(4) + '\\n' +
    '🤖 AI: ' + signal.confidence + '% confidence');
  
  console.log('[🐟 PIRANHA] ✅ ' + successfulOrders.length + '/' + exchangesToTrade.length + ' orders filled! Total positions: ' + state.positions.length + '/' + CONFIG.MAX_CONCURRENT_POSITIONS);
  
  return positions.length > 0 ? positions[0] : null;
}

// ============== MAIN STRATEGY LOOP ==============
async function runPiranha() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          🐟 PROFIT PIRANHA - Starting Strategy             ║');
  console.log('║          Position Size: $' + CONFIG.MIN_POSITION_SIZE + '-$' + CONFIG.MAX_POSITION_SIZE + '                        ║');
  console.log('║          Profit Target: $' + CONFIG.PROFIT_TARGET_SPOT + ' (spot) / $' + CONFIG.PROFIT_TARGET_LEVERAGE + ' (leverage)     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // CRITICAL: Bot NEVER starts automatically. Must wait for explicit start signal.
  console.log('[🐟 PIRANHA] ⚠️  Bot is in STANDBY mode. Awaiting manual start command.');
  console.log('[🐟 PIRANHA] Start the bot from the dashboard to begin trading.');
  
  // Wait for START_SIGNAL file to be created (by bot-control edge function)
  // ═══════════════════════════════════════════════════════════════════════
  // STRICT RULE: Bot NEVER starts by itself. ONLY START_SIGNAL file works.
  // Environment variable STRATEGY_ENABLED is IGNORED for safety.
  // The START_SIGNAL file must be created by the user via the dashboard.
  // ═══════════════════════════════════════════════════════════════════════
  const START_SIGNAL_FILE = '/app/data/START_SIGNAL';
  
  while (true) {
    // ONLY check for START_SIGNAL file - NO environment variable bypass
    const startSignalExists = fs.existsSync(START_SIGNAL_FILE);
    
    if (startSignalExists) {
      console.log('[🐟 PIRANHA] ✅ START SIGNAL RECEIVED from dashboard! Beginning trading...');
      break;
    }
    
    // Log waiting status every 30 seconds
    console.log('[🐟 PIRANHA] ⏳ STANDBY: Waiting for manual start from dashboard... (check every 10s)');
    await sleep(10000);
  }
  
  // CRITICAL: Reload credentials that were written by /control endpoint
  console.log('[🐟 PIRANHA] 🔄 Reloading credentials from .env.runtime...');
  reloadRuntimeEnv();
  
  // Verify credentials are loaded
  const creds = loadExchangeCredentials();
  const binanceReady = creds.binance?.apiKey && creds.binance?.apiSecret;
  const okxReady = creds.okx?.apiKey && creds.okx?.apiSecret;
  console.log('[🐟 PIRANHA] ════════════════════════════════════════════');
  console.log('[🐟 PIRANHA] 🔐 CREDENTIALS STATUS:');
  console.log('[🐟 PIRANHA]    Binance: ' + (binanceReady ? '✅ READY' : '❌ MISSING'));
  console.log('[🐟 PIRANHA]    OKX: ' + (okxReady ? '✅ READY' : '❌ MISSING'));
  console.log('[🐟 PIRANHA] ════════════════════════════════════════════');
  
  if (!binanceReady && !okxReady) {
    console.error('[🐟 PIRANHA] ❌ NO EXCHANGE CREDENTIALS LOADED!');
    console.error('[🐟 PIRANHA] Bot will wait for credentials via /control endpoint...');
  }
  
  loadState();
  state.active = true;
  state.startTime = state.startTime || new Date().toISOString();
  saveState();
  
  // LIVE MODE ONLY - All trades are real
  console.log('[🐟 PIRANHA] ═══════════════════════════════════════');
  console.log('[🐟 PIRANHA] 🎮 TRADING MODE: LIVE');
  console.log('[🐟 PIRANHA] 💰 Real Exchange Orders: YES');
  console.log('[🐟 PIRANHA] ═══════════════════════════════════════');
  
  console.log('[🐟 PIRANHA] Strategy is now ACTIVE');
  console.log('[🐟 PIRANHA] Monitoring positions and AI signals...');
  console.log('[🐟 PIRANHA] Max concurrent positions: ' + CONFIG.MAX_CONCURRENT_POSITIONS);
  console.log('[🐟 PIRANHA] AI signal check: every ' + CONFIG.AI_FETCH_INTERVAL + 'ms');
  
  // AI signal tracking
  let lastAIFetch = 0;
  
  // Main loop - runs forever (24/7)
  let loopCount = 0;
  while (true) {
    try {
      loopCount++;
      const now = Date.now();
      
      // ═══════════════════════════════════════════════════════════
      // AI SIGNAL FETCH - Every 1 second (aggressive signal detection)
      // ═══════════════════════════════════════════════════════════
      if (now - lastAIFetch > CONFIG.AI_FETCH_INTERVAL) {
        lastAIFetch = now;
        
        // Only fetch if we have room for more positions
        if (state.positions.length < CONFIG.MAX_CONCURRENT_POSITIONS) {
          let signals = await fetchAIRecommendations();
          
          // Filter: 70%+ confidence, 1/3/5 min timeframe, not already in position
          let tradableSignals = signals.filter(s => 
            s.confidence >= 70 && 
            [1, 3, 5].includes(s.profit_timeframe_minutes) &&
            !state.positions.some(p => p.symbol === (s.symbol.includes('USDT') ? s.symbol : s.symbol + 'USDT'))
          );
          
          // FALLBACK: Use statistical signal if no AI signals available
          if (tradableSignals.length === 0) {
            const fallbackSignal = await getStatisticalFallbackSignal();
            if (fallbackSignal) {
              tradableSignals = [fallbackSignal];
            }
          }
          
          // Open positions up to max limit
          for (const signal of tradableSignals) {
            if (state.positions.length >= CONFIG.MAX_CONCURRENT_POSITIONS) {
              console.log('[🐟 PIRANHA] Max positions reached (' + CONFIG.MAX_CONCURRENT_POSITIONS + '), waiting for closes...');
              break;
            }
            await openPosition(signal, {});
          }
        }
      }
      
      // ═══════════════════════════════════════════════════════════
      // POSITION MONITORING - Check profit targets AND STOP-LOSS (100ms interval)
      // ═══════════════════════════════════════════════════════════
      for (const position of state.positions) {
        const currentPrice = await fetchPrice(position.exchange, position.symbol);
        if (!currentPrice) continue;
        
        const netPnL = calculateNetPnL(
          position.entryPrice,
          currentPrice,
          position.size,
          position.side,
          position.exchange,
          position.isLeverage
        );
        
        position.currentPrice = currentPrice;
        position.unrealizedPnL = netPnL;
        
        // ═══════════════════════════════════════════════════════════
        // STRICT RULE: ONLY CLOSE ON PROFIT TARGET - NEVER ON LOSS
        // The bot holds positions indefinitely until profit target is reached
        // ═══════════════════════════════════════════════════════════
        
        // Log underwater positions for monitoring (NO ACTION - just visibility)
        if (netPnL < 0) {
          const holdTime = Date.now() - new Date(position.entryTime).getTime();
          const holdMinutes = Math.floor(holdTime / 60000);
          console.log('[🐟 PIRANHA] 📊 UNDERWATER: ' + position.symbol + ' | P&L: $' + netPnL.toFixed(2) + ' | Held: ' + holdMinutes + 'm | HOLDING (waiting for profit target)');
          
          // Update position P&L in Supabase for dashboard visibility
          if (position.supabaseId) {
            await updatePositionPnL(position.supabaseId, netPnL, currentPrice);
          }
        }
        
        // STRICT RULE: Only close when profit target is reached - NO STOP-LOSS
        const profitTargetHit = isProfitTargetReached(netPnL, position.isLeverage);
        const shouldClose = profitTargetHit; // PROFIT ONLY - NO STOP-LOSS
        
        if (shouldClose) {
          const exitReason = 'PROFIT TARGET';
          const emoji = '💰';
          
          console.log('[🐟 PIRANHA] ═══════════════════════════════════════');
          console.log('[🐟 PIRANHA] ' + emoji + ' ' + exitReason + ' HIT - EXECUTING EXIT ORDER');
          console.log('[🐟 PIRANHA]   Symbol: ' + position.symbol);
          console.log('[🐟 PIRANHA]   Exchange: ' + position.exchange.toUpperCase());
          console.log('[🐟 PIRANHA]   Side: ' + position.side.toUpperCase());
          console.log('[🐟 PIRANHA]   Entry: $' + position.entryPrice);
          console.log('[🐟 PIRANHA]   Exit: $' + currentPrice);
          console.log('[🐟 PIRANHA]   Net P&L: $' + netPnL.toFixed(2));
          console.log('[🐟 PIRANHA]   Exit Reason: ' + exitReason);
          console.log('[🐟 PIRANHA] ═══════════════════════════════════════');
          
          // EXECUTE REAL SELL ORDER TO CLOSE POSITION
          const creds = loadExchangeCredentials();
          const exchangeCreds = creds[position.exchange];
          
          if (!exchangeCreds || !exchangeCreds.apiKey) {
            console.error('[🐟 PIRANHA] ❌ No credentials for ' + position.exchange + ' - cannot close position!');
            continue;
          }
          
          // Execute sell order (spot mode: long positions close with SELL)
          const exitResult = await executeOrder(
            position.exchange,
            position.symbol,
            'sell',
            position.quantity,
            'market',
            exchangeCreds
          );
          
          if (!exitResult.success) {
            console.error('[🐟 PIRANHA] ❌ EXIT ORDER FAILED: ' + exitResult.error);
            console.error('[🐟 PIRANHA] Position remains open - will retry on next loop');
            continue; // Don't remove position, try again later
          }
          
          console.log('[🐟 PIRANHA] ✅ EXIT ORDER FILLED | OrderId: ' + exitResult.orderId + ' | Latency: ' + exitResult.latencyMs + 'ms');
          
          // Record exit order to Supabase
          await recordOrderToSupabase({
            exchange: position.exchange,
            symbol: position.symbol,
            side: 'sell',
            quantity: position.quantity,
            orderType: 'market',
            executedPrice: exitResult.executedPrice || currentPrice,
            status: 'filled',
            orderId: exitResult.orderId,
            clientOrderId: position.id + '-exit'
          });
          
          // Log the completed trade - CRITICAL: Record ALL trades including losses
          const completedTrade = {
            ...position,
            exitPrice: exitResult.executedPrice || currentPrice,
            exitTime: new Date().toISOString(),
            netPnL: netPnL,
            status: 'closed',
            exitReason: exitReason.toLowerCase().replace(' ', '_'),
            exitOrderId: exitResult.orderId,
            exitLatencyMs: exitResult.latencyMs
          };
          logTrade(completedTrade);
          
          // STRICT RULE: Sync ALL closed trades to Supabase trading_journal (wins AND losses)
          await recordTradeToSupabase(completedTrade, 'closed');
          
          // Close position in Supabase positions table
          if (position.supabaseId) {
            await closePositionInSupabase(position.supabaseId, currentPrice, netPnL);
          }
          
          // Track live trade progress
          await incrementLiveTradeProgress();
          console.log('[🐟 PIRANHA] ' + (profitTargetHit ? '💰' : '🛑') + ' Trade closed and synced to dashboard');
          
          // Update totals
          state.totalTrades++;
          state.totalPnL += netPnL;
          
          // Remove from positions
          state.positions = state.positions.filter(p => p.id !== position.id);
          
          console.log('[🐟 PIRANHA] ═══════════════════════════════════════');
          console.log('[🐟 PIRANHA] 📊 TRADE COMPLETE');
          console.log('[🐟 PIRANHA]   Exit Reason: ' + exitReason);
          console.log('[🐟 PIRANHA]   Total trades: ' + state.totalTrades);
          console.log('[🐟 PIRANHA]   Total P&L: $' + state.totalPnL.toFixed(2));
          console.log('[🐟 PIRANHA]   Open positions: ' + state.positions.length);
          console.log('[🐟 PIRANHA] ═══════════════════════════════════════');
          
          // Send Telegram alert - ONLY PROFIT (no stop-loss anymore)
          const telegramMessage = '💰 <b>TRADE CLOSED - PROFIT!</b>\\n' +
            '📊 ' + position.symbol + '\\n' +
            '🏦 Exchange: ' + position.exchange.toUpperCase() + '\\n' +
            '📈 Side: ' + position.side.toUpperCase() + '\\n' +
            '💵 P&L: +$' + netPnL.toFixed(2) + '\\n' +
            '🎯 Entry: $' + position.entryPrice.toFixed(4) + '\\n' +
            '✅ Exit: $' + currentPrice.toFixed(4) + '\\n' +
            '⚡ Latency: ' + exitResult.latencyMs + 'ms';
          
          await sendTelegramAlert(telegramMessage);
          
          // ═══════════════════════════════════════════════════════════
          // INSTANT REDEPLOY - Only after profitable trades
          // ═══════════════════════════════════════════════════════════
          if (profitTargetHit && state.positions.length < CONFIG.MAX_CONCURRENT_POSITIONS) {
            console.log('[🐟 PIRANHA] 🔄 Searching for instant redeploy opportunity...');
            const redeploySignals = await fetchAIRecommendations();
            let bestSignal = redeploySignals.find(s => 
              s.confidence >= 70 && 
              [1, 3, 5].includes(s.profit_timeframe_minutes) &&
              s.recommended_side !== 'short' && // SPOT MODE: Skip shorts
              !state.positions.some(p => p.symbol === (s.symbol.includes('USDT') ? s.symbol : s.symbol + 'USDT'))
            );
            
            // Use statistical fallback if no AI signal available
            if (!bestSignal) {
              const fallback = await getStatisticalFallbackSignal();
              if (fallback && fallback.recommended_side !== 'short') {
                bestSignal = fallback;
              }
            }
            
            if (bestSignal) {
              console.log('[🐟 PIRANHA] ⚡ INSTANT REDEPLOY with ' + bestSignal.symbol + ' (' + bestSignal.confidence + '% confidence)');
              await openPosition(bestSignal, {});
            }
          }
        }
      }
      
      saveState();
      
      // STRICT RULE: 100ms monitoring interval for fast profit capture
      await sleep(100);
      
      // Log status every 600 loops (every minute at 100ms)
      if (loopCount % 600 === 0) {
        // Log rate limiter status
        const binanceStatus = rateLimiters.binance.getStatus();
        console.log('[🐟 PIRANHA] 📊 Status: ' + state.positions.length + '/' + CONFIG.MAX_CONCURRENT_POSITIONS + ' positions | ' + state.totalTrades + ' trades | $' + state.totalPnL.toFixed(2) + ' P&L | Rate: ' + binanceStatus.tokens + '/' + binanceStatus.max);
      }
      
    } catch (err) {
      console.error('[🐟 PIRANHA] Loop error:', err.message);
      state.errors.push({ time: new Date().toISOString(), error: err.message });
      if (state.errors.length > 100) state.errors = state.errors.slice(-100);
      saveState();
      
      // Send Telegram alert for errors
      if (state.errors.length % 10 === 0) {
        await sendTelegramAlert('⚠️ <b>ERROR ALERT</b>\\n' +
          '❌ ' + err.message + '\\n' +
          '📊 Total errors: ' + state.errors.length);
      }
      
      await sleep(5000); // Wait 5s on error
    }
  }
}

// ============== POSITION RECONCILIATION ==============
// Sync local state with actual exchange positions on startup
async function reconcilePositionsOnStartup() {
  console.log('[🐟 PIRANHA] ═══════════════════════════════════════');
  console.log('[🐟 PIRANHA] 🔄 RECONCILING POSITIONS WITH EXCHANGE');
  console.log('[🐟 PIRANHA] ═══════════════════════════════════════');
  
  // Get unique exchanges from open positions
  const exchanges = [...new Set(state.positions.map(p => p.exchange))];
  
  for (const exchange of exchanges) {
    console.log('[🐟 PIRANHA] Checking ' + exchange + ' positions...');
    
    // Verify prices are still accessible (basic connectivity check)
    for (const position of state.positions.filter(p => p.exchange === exchange)) {
      const currentPrice = await fetchPrice(exchange, position.symbol);
      
      if (!currentPrice) {
        console.log('[🐟 PIRANHA] ⚠️ Cannot get price for ' + position.symbol + ' - may be closed externally');
        // Mark for manual review but don't auto-close
        position.needsReconciliation = true;
      } else {
        // Update current price and P&L
        const netPnL = calculateNetPnL(
          position.entryPrice,
          currentPrice,
          position.size,
          position.side,
          position.exchange,
          position.isLeverage
        );
        position.currentPrice = currentPrice;
        position.unrealizedPnL = netPnL;
        position.lastReconciled = new Date().toISOString();
        console.log('[🐟 PIRANHA] ✅ ' + position.symbol + ': $' + currentPrice.toFixed(4) + ' (P&L: $' + netPnL.toFixed(2) + ')');
      }
    }
  }
  
  // Remove orphaned positions that need manual review
  const orphanedCount = state.positions.filter(p => p.needsReconciliation).length;
  if (orphanedCount > 0) {
    console.log('[🐟 PIRANHA] ⚠️ ' + orphanedCount + ' positions need manual review');
    await sendTelegramAlert('⚠️ <b>RECONCILIATION ALERT</b>\\n' +
      orphanedCount + ' positions could not be verified.\\n' +
      'Please check exchange manually.');
  }
  
  saveState();
  console.log('[🐟 PIRANHA] Reconciliation complete. Active positions: ' + state.positions.length);
}

// ============== STARTUP ==============
console.log('[🐟 PIRANHA] Strategy Runner initializing...');
console.log('[🐟 PIRANHA] Config:', {
  minPosition: CONFIG.MIN_POSITION_SIZE,
  maxPosition: CONFIG.MAX_POSITION_SIZE,
  profitSpot: CONFIG.PROFIT_TARGET_SPOT,
  profitLeverage: CONFIG.PROFIT_TARGET_LEVERAGE,
  enabled: CONFIG.ENABLED,
  supabaseConfigured: !!CONFIG.SUPABASE_URL && !!CONFIG.SUPABASE_KEY,
  telegramConfigured: !!CONFIG.TELEGRAM_BOT_TOKEN && !!CONFIG.TELEGRAM_CHAT_ID
});

// Run position reconciliation before starting
loadState();
reconcilePositionsOnStartup().then(() => {
  // Start the strategy after reconciliation
  runPiranha().catch(err => {
    console.error('[🐟 PIRANHA] Fatal error:', err);
    sendTelegramAlert('❌ <b>FATAL ERROR</b>\\n' + err.message);
    process.exit(1);
  });
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  console.log('[🐟 PIRANHA] Received SIGTERM, saving state...');
  state.active = false;
  saveState();
  sendTelegramAlert('🛑 Bot shutting down (SIGTERM)').then(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[🐟 PIRANHA] Received SIGINT, saving state...');
  state.active = false;
  saveState();
  sendTelegramAlert('🛑 Bot shutting down (SIGINT)').then(() => process.exit(0));
});
STRATEGY_EOF

# Create package.json
cat > app/package.json << 'PKG_EOF'
{
  "name": "profit-piranha-hft-bot",
  "version": "2.0.0",
  "description": "Profit Piranha - 24/7 Micro-Scalping Trading Bot",
  "main": "health.js",
  "scripts": {
    "start": "node health.js & node strategy.js",
    "health": "node health.js",
    "strategy": "node strategy.js"
  }
}
PKG_EOF

# Create sample .env config file
cat > config/.env.example << 'ENV_EOF'
# ============================================================
# PROFIT PIRANHA - CONFIGURATION FILE
# ============================================================
# CRITICAL: Copy this file to .env and fill in ALL values
# The bot will NOT start without proper Supabase credentials!
# ============================================================

# Exchange API Keys (add your own)
BINANCE_API_KEY=your_api_key
BINANCE_API_SECRET=your_api_secret

OKX_API_KEY=your_api_key
OKX_API_SECRET=your_api_secret
OKX_PASSPHRASE=your_passphrase

BYBIT_API_KEY=your_api_key
BYBIT_API_SECRET=your_api_secret

# Strategy Settings
# CRITICAL: Bot NEVER starts automatically. Set via dashboard only.
STRATEGY_ENABLED=false
MIN_POSITION_SIZE=350
MAX_POSITION_SIZE=500
PROFIT_TARGET_SPOT=1
PROFIT_TARGET_LEVERAGE=3

# ============================================================
# SUPABASE CONNECTION - REQUIRED!
# ============================================================
# Get these from your Supabase project settings -> API
# Use SERVICE ROLE key (not anon key) for secure database access
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# ============================================================
# TELEGRAM ALERTS (Optional but recommended)
# ============================================================
# Get from @BotFather on Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
ENV_EOF

# Detect compose command (docker-compose vs docker compose)
log_info "Detecting Docker Compose command..."
if command -v docker-compose &> /dev/null; then
  COMPOSE="docker-compose"
  log_info "Using: docker-compose"
elif docker compose version &> /dev/null; then
  COMPOSE="docker compose"
  log_info "Using: docker compose (plugin)"
else
  log_error "Neither docker-compose nor docker compose found!"
  exit 1
fi

# Create systemd service (oneshot + detached for reliable startup)
log_info "Creating systemd service..."
cat > /etc/systemd/system/hft-bot.service << SERVICE_EOF
[Unit]
Description=Profit Piranha HFT Trading Bot
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/hft-bot
ExecStart=$COMPOSE up -d --remove-orphans
ExecStop=$COMPOSE down
TimeoutStartSec=300
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
SERVICE_EOF

# Disable non-essential Ubuntu services for minimal CPU usage
log_info "Disabling non-essential services for HFT optimization..."
systemctl disable --now snapd.service snapd.socket 2>/dev/null || true
systemctl disable --now cups.service cups-browsed.service 2>/dev/null || true
systemctl disable --now bluetooth.service 2>/dev/null || true
systemctl disable --now avahi-daemon.service avahi-daemon.socket 2>/dev/null || true
systemctl disable --now ModemManager.service 2>/dev/null || true
systemctl disable --now NetworkManager-wait-online.service 2>/dev/null || true
systemctl disable --now packagekit.service 2>/dev/null || true
systemctl mask snapd.service cups.service bluetooth.service avahi-daemon.service 2>/dev/null || true

# Configure kernel for ultra-low latency
log_info "Configuring kernel for low-latency trading..."
cat >> /etc/sysctl.conf << 'SYSCTL_EOF'
# Network performance tuning
net.core.rmem_max=16777216
net.core.wmem_max=16777216
net.core.rmem_default=1048576
net.core.wmem_default=1048576
net.ipv4.tcp_rmem=4096 1048576 16777216
net.ipv4.tcp_wmem=4096 1048576 16777216
net.ipv4.tcp_low_latency=1
net.ipv4.tcp_nodelay=1
net.ipv4.tcp_fastopen=3
net.core.netdev_max_backlog=65536

# Reduce swap usage
vm.swappiness=10
vm.dirty_ratio=10
vm.dirty_background_ratio=5
SYSCTL_EOF
sysctl -p 2>/dev/null || true

# Configure firewall
log_info "Configuring firewall..."
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 8080/tcp comment 'Health check'
ufw allow 443/tcp comment 'HTTPS API'
ufw reload

# Configure fail2ban
log_info "Configuring fail2ban..."
cat > /etc/fail2ban/jail.local << 'FAIL2BAN_EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 86400
FAIL2BAN_EOF
systemctl enable fail2ban
systemctl restart fail2ban

# Pull images BEFORE starting service (avoids systemd timeout)
log_info "Pulling Docker images (this may take a few minutes)..."
cd /opt/hft-bot
$COMPOSE pull --quiet || {
  log_warn "Pull failed, retrying..."
  $COMPOSE pull
}

# Start containers directly first
log_piranha "Starting Profit Piranha containers..."
$COMPOSE up -d --remove-orphans

# Wait for containers to be healthy
log_info "Waiting for containers to start..."
sleep 5

# STRICT RULE: Bot NEVER starts automatically - manual start required
log_info "Configuring Profit Piranha service (MANUAL START ONLY)..."
systemctl daemon-reload
# CRITICAL: Do NOT enable auto-start on reboot - this was intentionally removed
# systemctl enable hft-bot  ← REMOVED FOR SAFETY

# Verify installation
log_info "Verifying installation..."
if curl -s http://localhost:8080/health | jq -e '.status == "ok"' > /dev/null 2>&1; then
  log_info "Health check: ✓ PASSED"
else
  log_warn "Health check not responding yet, checking containers..."
  echo ""
  echo "=== Container Status ==="
  $COMPOSE ps
  echo ""
  echo "=== Container Logs ==="
  $COMPOSE logs --tail=50
  echo ""
fi

DOCKER_VER=\$(docker --version | cut -d' ' -f3 | tr -d ',')
COMPOSE_VER=\$(docker compose version --short)

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║        🐟 PROFIT PIRANHA - INSTALLATION COMPLETE!          ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  📍 Server: \$SERVER_IP                                     ║"
echo "║  🔍 Health: http://\$SERVER_IP:8080/health                  ║"
echo "║  📁 Path:   /opt/hft-bot/                                  ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  🐳 Docker: \$DOCKER_VER                                    ║"
echo "║  📦 Compose: \$COMPOSE_VER (V2)                             ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  Strategy Settings:                                        ║"
echo "║  💰 Position Size: \\$350 - \\$500                             ║"
echo "║  🎯 Profit Target: \\$1 (spot) / \\$3 (leverage)               ║"
echo "║  ⚡ Mode: 24/7 continuous trading                          ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  Next Steps:                                               ║"
echo "║  1. Whitelist \$SERVER_IP on your exchanges                 ║"
echo "║  2. cp /opt/hft-bot/config/.env.example /opt/hft-bot/config/.env ║"
echo "║  3. Edit /opt/hft-bot/config/.env with your API keys       ║"
echo "║  4. systemctl restart hft-bot                              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const format = url.searchParams.get('format') || 'script';

    if (format === 'json') {
      return new Response(JSON.stringify({
        success: true,
        name: 'Profit Piranha',
        version: '2.0.0',
        message: 'Dynamic IP detection - run the script to see your server IP',
        installCommand: 'curl -sSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | sudo bash',
        healthEndpoint: 'http://<YOUR-SERVER-IP>:8080/health',
        strategy: {
          name: 'Profit Piranha',
          minPosition: 350,
          maxPosition: 500,
          profitTargetSpot: 1,
          profitTargetLeverage: 3,
          mode: '24/7 continuous'
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Return the bash script directly
    return new Response(INSTALL_SCRIPT, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
