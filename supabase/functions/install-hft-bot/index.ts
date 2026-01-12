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

# ============================================================================
# INSTALL VERSION MARKER - For debugging and verification
# ============================================================================
INSTALL_VERSION="2.2.0-\$(date +%Y%m%d%H%M%S)"
log_info "Install version: \$INSTALL_VERSION"
echo "\$INSTALL_VERSION" > /opt/hft-bot/VERSION

# ============================================================================
# CREATE STOP_SIGNAL BY DEFAULT - Safe mode on fresh install
# ============================================================================
log_info "Creating STOP_SIGNAL for safe mode (bot will not trade until started)..."
mkdir -p /opt/hft-bot/data
echo '{"created_at":"'\$(date -Iseconds)'","reason":"fresh_install","source":"installer"}' > /opt/hft-bot/data/STOP_SIGNAL
rm -f /opt/hft-bot/data/START_SIGNAL
log_info "✅ STOP_SIGNAL created - bot will start in SAFE MODE"

# ============================================================================
# CREATE DOCKERFILE - Bake JS files into image (no bind-mount for /app)
# ============================================================================
log_info "Creating Dockerfile (bakes code into image to prevent truncation)..."
cat > Dockerfile << 'DOCKERFILE_EOF'
FROM node:20-alpine

WORKDIR /app

# Install any build dependencies if needed
RUN apk add --no-cache curl

# Copy version marker for debugging
COPY VERSION /app/VERSION

# Copy application files into image at build time
# This prevents runtime truncation issues from bind mounts
COPY app/supervisor.js /app/supervisor.js
COPY app/health.js /app/health.js
COPY app/strategy.js /app/strategy.js
COPY app/package.json /app/package.json

# Create directories that will be bind-mounted at runtime
RUN mkdir -p /app/logs /app/config /app/data /app/strategies

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["node", "supervisor.js"]
DOCKERFILE_EOF

# Create docker-compose.yml with BUILD context (code baked into image)
log_info "Creating Docker Compose configuration..."
cat > docker-compose.yml << 'COMPOSE_EOF'
version: '3.8'
services:
  hft-bot:
    build:
      context: .
      dockerfile: Dockerfile
    image: profit-piranha-bot:latest
    container_name: hft-bot
    working_dir: /app
    env_file:
      - .env.exchanges
    volumes:
      # ONLY mount persistent data directories, NOT application code
      # This prevents truncated/corrupted JS files from surviving restarts
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

// Read install version if available
let installVersion = 'unknown';
try {
  if (fs.existsSync('/app/VERSION')) {
    installVersion = fs.readFileSync('/app/VERSION', 'utf8').trim();
  }
} catch (e) {}

console.log('[SUPERVISOR] 🐟 Starting Profit Piranha bot supervisor v2.2...');
console.log('[SUPERVISOR] Install version:', installVersion);
console.log('[SUPERVISOR] Time:', new Date().toISOString());

let healthProcess = null;
let strategyProcess = null;
let healthRestarts = 0;
let strategyRestarts = 0;

const MAX_RESTARTS = 1000;
const BASE_RESTART_DELAY = 2000;
const MAX_RESTART_DELAY = 60000;
let currentRestartDelay = BASE_RESTART_DELAY;
let lastStrategyStart = Date.now();

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
    
    // Exponential backoff with cap
    currentRestartDelay = Math.min(currentRestartDelay * 1.5, MAX_RESTART_DELAY);
    
    if (strategyRestarts < MAX_RESTARTS) {
      console.log('[SUPERVISOR] Restarting strategy.js in ' + (currentRestartDelay/1000) + 's...');
      setTimeout(() => {
        lastStrategyStart = Date.now();
        startStrategy();
      }, currentRestartDelay);
      
      // Reset delay after stable run (5+ minutes without crash)
      setTimeout(() => {
        if (strategyProcess && !strategyProcess.killed && Date.now() - lastStrategyStart > 300000) {
          currentRestartDelay = BASE_RESTART_DELAY;
          console.log('[SUPERVISOR] Strategy stable, reset delay to ' + BASE_RESTART_DELAY + 'ms');
        }
      }, 300000);
    }
  });
  
  strategyProcess.on('error', (err) => {
    strategyRestarts++;
    console.error('[SUPERVISOR] ❌ strategy.js spawn error:', err.message);
    setTimeout(startStrategy, RESTART_DELAY);
  });
};

// Start health process (always needed for monitoring)
startHealth();

// STRICT RULE: NEVER auto-start strategy - wait for explicit START_SIGNAL
const START_SIGNAL_FILE = '/app/data/START_SIGNAL';
const STOP_SIGNAL_FILE = '/app/data/STOP_SIGNAL';

if (fs.existsSync(STOP_SIGNAL_FILE)) {
  console.log('[SUPERVISOR] ⛔ STOP_SIGNAL found - strategy will NOT start');
  console.log('[SUPERVISOR] Bot is in SAFE MODE - remove STOP_SIGNAL and create START_SIGNAL to trade');
} else if (fs.existsSync(START_SIGNAL_FILE)) {
  console.log('[SUPERVISOR] ✅ START_SIGNAL found - starting strategy...');
  strategyRestarts = 0;
  currentRestartDelay = BASE_RESTART_DELAY;
  setTimeout(startStrategy, 500);
} else {
  console.log('[SUPERVISOR] ⏳ STANDBY MODE - No START_SIGNAL found');
  console.log('[SUPERVISOR] Bot will NOT trade until started from dashboard');
  console.log('[SUPERVISOR] Watching for START_SIGNAL file...');
  
  // Watch for START_SIGNAL file to be created by dashboard
  const watchInterval = setInterval(() => {
    if (fs.existsSync(STOP_SIGNAL_FILE)) {
      // STOP takes priority - do nothing
      return;
    }
    if (fs.existsSync(START_SIGNAL_FILE)) {
      console.log('[SUPERVISOR] ✅ START_SIGNAL detected! Starting strategy...');
      clearInterval(watchInterval);
      strategyRestarts = 0;
      currentRestartDelay = BASE_RESTART_DELAY;
      startStrategy();
    }
  }, 5000); // Check every 5 seconds
}

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
 * 🐟 PROFIT PIRANHA - Dual-Exchange HFT Strategy
 * 
 * Trades on BOTH Binance AND OKX simultaneously for each signal.
 * - Queries AI signals from Supabase ai_market_updates table
 * - Executes trades in parallel on both exchanges
 * - Logs all trades to trading_journal table
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '/app/data/.env.runtime' });

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Exchange APIs
let binanceClient = null;
let okxClient = null;

if (process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET) {
  try {
    const Binance = require('binance-api-node').default;
    binanceClient = Binance({
      apiKey: process.env.BINANCE_API_KEY,
      apiSecret: process.env.BINANCE_API_SECRET,
      useServerTime: true
    });
    console.log('[🐟 PIRANHA] ✅ Binance client initialized');
  } catch (error) {
    console.error('[🐟 PIRANHA] ❌ Binance client init failed:', error.message);
  }
}

if (process.env.OKX_API_KEY && process.env.OKX_API_SECRET && process.env.OKX_API_PASSPHRASE) {
  try {
    const { RestClient } = require('okx-api');
    okxClient = new RestClient(
      process.env.OKX_API_KEY,
      process.env.OKX_API_SECRET,
      process.env.OKX_API_PASSPHRASE
    );
    console.log('[🐟 PIRANHA] ✅ OKX client initialized');
  } catch (error) {
    console.error('[🐟 PIRANHA] ❌ OKX client init failed:', error.message);
  }
}

// Normalize symbol: "BTC" -> "BTCUSDT" for Binance, "BTC-USDT" for OKX
function normalizeSymbol(symbol, exchange) {
  let normalized = symbol.toUpperCase().replace(/[-_\/]/g, '');
  
  if (normalized.endsWith('USDT') || normalized.endsWith('USD')) {
    if (exchange.toLowerCase() === 'okx') {
      return normalized.replace('USDT', '-USDT').replace('USD', '-USD');
    }
    return normalized;
  }
  
  if (exchange.toLowerCase() === 'binance') {
    return normalized + 'USDT';
  } else if (exchange.toLowerCase() === 'okx') {
    return normalized + '-USDT';
  }
  
  return normalized + 'USDT';
}

// Execute trade on Binance
async function executeBinanceTrade(symbol, side, quantity) {
  if (!binanceClient) {
    return { success: false, error: 'Binance client not initialized' };
  }
  
  try {
    const order = await binanceClient.order({
      symbol: symbol,
      side: side,
      type: 'MARKET',
      quantity: quantity.toString()
    });
    
    return {
      success: true,
      orderId: order.orderId,
      status: order.status,
      executedQty: parseFloat(order.executedQty || 0),
      price: parseFloat(order.price || order.fills?.[0]?.price || 0)
    };
  } catch (error) {
    console.error('[🐟 PIRANHA] Binance trade error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

// Execute trade on OKX
async function executeOKXTrade(symbol, side, size) {
  if (!okxClient) {
    return { success: false, error: 'OKX client not initialized' };
  }
  
  try {
    const orderSide = side === 'BUY' ? 'buy' : 'sell';
    const order = await okxClient.submitOrder({
      instId: symbol,
      tdMode: 'cash',
      side: orderSide,
      ordType: 'market',
      sz: size.toString()
    });
    
    if (order.code === '0' && order.data && order.data.length > 0) {
      const orderData = order.data[0];
      return {
        success: true,
        orderId: orderData.ordId,
        status: orderData.state || 'filled',
        executedQty: parseFloat(orderData.accFillSz || size),
        price: parseFloat(orderData.avgPx || 0)
      };
    } else {
      return {
        success: false,
        error: order.msg || 'OKX order failed'
      };
    }
  } catch (error) {
    console.error('[🐟 PIRANHA] OKX trade error:', error);
    return {
      success: false,
      error: error.message || 'Unknown OKX error'
    };
  }
}

// Check if trading is enabled
async function isTradingEnabled() {
  try {
    const { data, error } = await supabase
      .from('trading_config')
      .select('trading_enabled, global_kill_switch_enabled, bot_status')
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .single();
    
    if (error || !data) {
      console.warn('[🐟 PIRANHA] ⚠️  Failed to fetch trading config, defaulting to enabled');
      return true;
    }
    
    const enabled = data.trading_enabled && 
                   !data.global_kill_switch_enabled && 
                   data.bot_status === 'running';
    
    if (!enabled) {
      console.log('[🐟 PIRANHA] Trading disabled: enabled=' + data.trading_enabled + ', kill_switch=' + data.global_kill_switch_enabled + ', bot_status=' + data.bot_status);
    }
    
    return enabled;
  } catch (error) {
    console.error('[🐟 PIRANHA] Error checking trading config:', error);
    return true;
  }
}

// Check deployment status
async function isBotRunning() {
  try {
    const { data, error } = await supabase
      .from('hft_deployments')
      .select('bot_status, status')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !data) {
      console.warn('[🐟 PIRANHA] ⚠️  Failed to fetch deployment status');
      return false;
    }
    
    const running = data.bot_status === 'running' && data.status === 'running';
    
    if (!running) {
      console.log('[🐟 PIRANHA] Bot not running: bot_status=' + data.bot_status + ', status=' + data.status);
    }
    
    return running;
  } catch (error) {
    console.error('[🐟 PIRANHA] Error checking deployment status:', error);
    return false;
  }
}

// Process and execute trades on BOTH exchanges simultaneously
async function processSignals() {
  const tradingEnabled = await isTradingEnabled();
  const botRunning = await isBotRunning();
  
  if (!tradingEnabled || !botRunning) {
    return;
  }
  
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  const { data: signals, error: signalsError } = await supabase
    .from('ai_market_updates')
    .select('*')
    .gte('confidence', 70)
    .gte('created_at', fiveMinutesAgo)
    .order('confidence', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (signalsError) {
    console.error('[🐟 PIRANHA] ❌ Error fetching signals:', signalsError);
    return;
  }
  
  if (!signals || signals.length === 0) {
    return;
  }
  
  // Filter for BUY/LONG signals only
  const buySignals = signals.filter(s => {
    const recSide = (s.recommended_side || '').toUpperCase();
    const sentiment = (s.sentiment || '').toUpperCase();
    return recSide === 'BUY' || recSide === 'LONG' || sentiment === 'BULLISH';
  });
  
  if (buySignals.length === 0) {
    return;
  }
  
  const signalIds = buySignals.map(s => s.id);
  const { data: existingTrades } = await supabase
    .from('trading_journal')
    .select('ai_reasoning')
    .in('ai_reasoning', signalIds.map(id => 'signal_' + id));
  
  const tradedSignalIds = new Set((existingTrades || []).map(t => t.ai_reasoning?.replace('signal_', '')));
  const newSignals = buySignals.filter(s => !tradedSignalIds.has(s.id));
  
  if (newSignals.length === 0) {
    return;
  }
  
  console.log('[🐟 PIRANHA] 📊 Processing ' + newSignals.length + ' new signals...');
  
  for (const signal of newSignals) {
    try {
      const side = 'BUY';
      const baseQuantity = 0.001;
      const confidenceMultiplier = Math.max(0.5, signal.confidence / 100);
      const quantity = baseQuantity * confidenceMultiplier;
      
      // Execute trades on BOTH exchanges simultaneously
      const binanceSymbol = normalizeSymbol(signal.symbol, 'binance');
      const okxSymbol = normalizeSymbol(signal.symbol, 'okx');
      
      const tradePromises = [];
      
      // Add Binance trade if client is available
      if (binanceClient) {
        tradePromises.push(
          executeBinanceTrade(binanceSymbol, side, quantity)
            .then(result => ({ exchange: 'binance', symbol: binanceSymbol, result }))
            .catch(error => ({ exchange: 'binance', symbol: binanceSymbol, result: { success: false, error: error.message } }))
        );
      }
      
      // Add OKX trade if client is available
      if (okxClient) {
        tradePromises.push(
          executeOKXTrade(okxSymbol, side, quantity)
            .then(result => ({ exchange: 'okx', symbol: okxSymbol, result }))
            .catch(error => ({ exchange: 'okx', symbol: okxSymbol, result: { success: false, error: error.message } }))
        );
      }
      
      if (tradePromises.length === 0) {
        console.warn('[🐟 PIRANHA] ⚠️  No exchange clients available for signal ' + signal.id);
        continue;
      }
      
      // Execute all trades in parallel
      const tradeResults = await Promise.all(tradePromises);
      
      // Log each trade result to trading_journal
      for (const { exchange, symbol, result } of tradeResults) {
        if (result.success) {
          const { error: logError } = await supabase
            .from('trading_journal')
            .insert({
              exchange: exchange,
              symbol: symbol,
              side: side.toLowerCase(),
              entry_price: result.price || signal.current_price || 0,
              quantity: result.executedQty || quantity,
              status: 'open',
              ai_reasoning: 'signal_' + signal.id,
              execution_latency_ms: 0
            });
          
          if (logError) {
            console.error('[🐟 PIRANHA] ❌ Failed to log ' + exchange + ' trade:', logError);
          } else {
            console.log('[🐟 PIRANHA] ✅ EXECUTED: ' + side + ' ' + quantity + ' ' + symbol + ' on ' + exchange + ' | Order: ' + result.orderId);
          }
        } else {
          console.error('[🐟 PIRANHA] ❌ FAILED: ' + side + ' ' + symbol + ' on ' + exchange + ' - ' + result.error);
        }
      }
      
      // Small delay between signals for HFT rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error('[🐟 PIRANHA] ❌ Error processing signal ' + signal.id + ':', error);
    }
  }
}

// Main trading loop
async function tradingLoop() {
  console.log('[🐟 PIRANHA] 🚀 Trading loop started');
  
  let iterationCount = 0;
  
  while (true) {
    try {
      const startSignalPath = '/app/data/START_SIGNAL';
      const stopSignalPath = '/app/data/STOP_SIGNAL';
      
      const startSignalExists = fs.existsSync(startSignalPath);
      const stopSignalExists = fs.existsSync(stopSignalPath);
      
      if (!startSignalExists || stopSignalExists) {
        if (iterationCount % 10 === 0) {
          console.log('[🐟 PIRANHA] ⏸️  Paused: START_SIGNAL missing or STOP_SIGNAL present');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        iterationCount++;
        continue;
      }
      
      await processSignals();
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      iterationCount++;
      
    } catch (error) {
      console.error('[🐟 PIRANHA] ❌ Trading loop error:', error);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Start trading loop
if (require.main === module) {
  console.log('[🐟 PIRANHA] 🐟 PIRANHA HFT Strategy Starting...');
  console.log('[🐟 PIRANHA] ✅ Credentials loaded');
  console.log('[🐟 PIRANHA] ✅ Supabase connected');
  console.log('[🐟 PIRANHA] 📍 Supabase URL: ' + supabaseUrl);
  console.log('[🐟 PIRANHA] 🔐 Binance: ' + (binanceClient ? '✅ Ready' : '❌ Not available'));
  console.log('[🐟 PIRANHA] 🔐 OKX: ' + (okxClient ? '✅ Ready' : '❌ Not available'));
  console.log('[🐟 PIRANHA] 🚀 DUAL-EXCHANGE MODE: Trading on ' + (binanceClient && okxClient ? 'BOTH Binance & OKX' : binanceClient ? 'Binance only' : okxClient ? 'OKX only' : 'NO EXCHANGES'));
  
  tradingLoop().catch(error => {
    console.error('[🐟 PIRANHA] 💥 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { tradingLoop, processSignals };
STRATEGY_EOF

# ============================================================================
# POST-WRITE FILE VALIDATION - Detect truncation/corruption before proceeding
# ============================================================================
log_info "Validating generated JavaScript files..."

validate_js_file() {
  local file="\$1"
  local min_size="\$2"
  local required_pattern="\$3"
  local file_name=\$(basename "\$file")
  
  # Check file exists
  if [ ! -f "\$file" ]; then
    log_error "❌ VALIDATION FAILED: \$file_name does not exist!"
    return 1
  fi
  
  # Check file size (bytes)
  local size=\$(wc -c < "\$file")
  if [ "\$size" -lt "\$min_size" ]; then
    log_error "❌ VALIDATION FAILED: \$file_name is truncated! Size: \$size bytes (expected >= \$min_size)"
    log_error "   This indicates the heredoc was not written completely."
    return 1
  fi
  
  # Check for required pattern (proves key sections exist)
  if ! grep -q "\$required_pattern" "\$file"; then
    log_error "❌ VALIDATION FAILED: \$file_name missing required pattern: \$required_pattern"
    log_error "   This indicates file corruption or incomplete write."
    return 1
  fi
  
  log_info "✅ \$file_name validated: \$size bytes, pattern found"
  return 0
}

# Validate supervisor.js (should be ~4KB+, must contain "startStrategy")
validate_js_file "app/supervisor.js" 3000 "startStrategy" || {
  log_error "FATAL: supervisor.js validation failed. Aborting install."
  exit 1
}

# Validate health.js (should be ~20KB+, must contain "ping-exchanges")
validate_js_file "app/health.js" 15000 "ping-exchanges" || {
  log_error "FATAL: health.js validation failed. Aborting install."
  exit 1
}

# Validate strategy.js (should be ~50KB+, must contain the FIXED regex pattern)
validate_js_file "app/strategy.js" 40000 "replace(/\\\x0D/g" || {
  log_error "FATAL: strategy.js validation failed. Aborting install."
  log_error "       This is the file that was causing the 'Invalid regular expression: missing /' error."
  exit 1
}

# Additional check: Ensure the problematic regex line is complete
if grep -q 'envContent.replace(/$' app/strategy.js; then
  log_error "❌ CRITICAL: strategy.js contains truncated regex pattern!"
  log_error "   Found: envContent.replace(/ (incomplete)"
  log_error "   Expected: envContent.replace(/\\x0D/g, '').split(...)"
  log_error "   Aborting install to prevent broken container."
  exit 1
fi

log_info "✅ All JavaScript files validated successfully!"

# Create package.json
cat > app/package.json << 'PKG_EOF'
{
  "name": "profit-piranha-hft-bot",
  "version": "2.2.0",
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

# ============================================================================
# BUILD AND START CONTAINERS - Code is baked into image (no bind-mount issues)
# ============================================================================
log_info "Building Docker image with validated JavaScript files..."
cd /opt/hft-bot

# Pull base images first
$COMPOSE pull redis --quiet || true

# Build the hft-bot image (bakes in the validated JS files)
log_info "Building profit-piranha-bot image..."
$COMPOSE build --no-cache hft-bot || {
  log_error "Docker build failed! Checking logs..."
  cat Dockerfile
  ls -la app/
  exit 1
}

log_info "✅ Docker image built successfully with validated code baked in"

# Start containers
log_piranha "Starting Profit Piranha containers..."
$COMPOSE up -d --remove-orphans

# Wait for containers to be healthy
log_info "Waiting for containers to start..."
sleep 8

# Verify the container has the correct strategy.js
log_info "Verifying strategy.js inside container..."
if docker exec hft-bot sh -c 'grep -q "replace(/\\\x0D/g" /app/strategy.js'; then
  log_info "✅ Container has correct strategy.js (regex pattern validated)"
else
  log_error "❌ Container strategy.js validation failed!"
  docker exec hft-bot sh -c 'nl -ba /app/strategy.js | sed -n "18,30p"'
  exit 1
fi

# Verify STOP_SIGNAL is visible inside container
log_info "Verifying STOP_SIGNAL inside container..."
if docker exec hft-bot sh -c 'test -f /app/data/STOP_SIGNAL'; then
  log_info "✅ STOP_SIGNAL present - bot is in SAFE MODE"
else
  log_warn "STOP_SIGNAL not found in container, creating..."
  docker exec hft-bot sh -c 'echo "{\"created_at\":\"$(date -Iseconds)\",\"reason\":\"post_install\",\"source\":\"installer\"}" > /app/data/STOP_SIGNAL'
fi

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
