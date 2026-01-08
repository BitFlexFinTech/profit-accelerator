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

# Create docker-compose.yml with both health.js and strategy.js
log_info "Creating Docker configuration..."
cat > docker-compose.yml << 'COMPOSE_EOF'
version: '3.8'
services:
  hft-bot:
    image: node:20-alpine
    container_name: hft-bot
    working_dir: /app
    volumes:
      - ./app:/app
      - ./logs:/app/logs
      - ./config:/app/config
      - ./data:/app/data
      - ./strategies:/app/strategies
    environment:
      - NODE_ENV=production
      - TZ=Asia/Tokyo
      - STRATEGY_ENABLED=false
      - STRATEGY_NAME=profit-piranha
      - MIN_POSITION_SIZE=350
      - MAX_POSITION_SIZE=500
      - PROFIT_TARGET_SPOT=1
      - PROFIT_TARGET_LEVERAGE=3
      - BINANCE_API_KEY=\${BINANCE_API_KEY:-}
      - BINANCE_API_SECRET=\${BINANCE_API_SECRET:-}
      - OKX_API_KEY=\${OKX_API_KEY:-}
      - OKX_API_SECRET=\${OKX_API_SECRET:-}
      - OKX_PASSPHRASE=\${OKX_PASSPHRASE:-}
      - BYBIT_API_KEY=\${BYBIT_API_KEY:-}
      - BYBIT_API_SECRET=\${BYBIT_API_SECRET:-}
    restart: always
    network_mode: host
    command: ["sh", "-c", "node health.js & node strategy.js"]
    
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

# Create health check server with balance proxy
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
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(8080, '0.0.0.0', () => {
  console.log('[🐟 PIRANHA] Health check + Balance proxy running on port 8080');
});

process.on('SIGTERM', () => {
  console.log('[🐟 PIRANHA] Shutting down...');
  server.close();
  process.exit(0);
});
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

// ============== CONFIGURATION ==============
const CONFIG = {
  // Position sizing
  MIN_POSITION_SIZE: parseFloat(process.env.MIN_POSITION_SIZE) || 350,
  MAX_POSITION_SIZE: parseFloat(process.env.MAX_POSITION_SIZE) || 500,
  
  // Profit targets (after fees)
  PROFIT_TARGET_SPOT: parseFloat(process.env.PROFIT_TARGET_SPOT) || 1.00,
  PROFIT_TARGET_LEVERAGE: parseFloat(process.env.PROFIT_TARGET_LEVERAGE) || 3.00,
  
  // Trading settings
  ENABLED: process.env.STRATEGY_ENABLED === 'true',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_KEY: process.env.SUPABASE_ANON_KEY || '',
  
  // Data paths
  STATE_FILE: '/app/data/strategy-state.json',
  TRADES_FILE: '/app/data/trades.json',
  CONFIG_FILE: '/app/config/.env',
};

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

function saveState() {
  try {
    state.lastUpdate = new Date().toISOString();
    fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('[🐟 PIRANHA] Failed to save state:', err.message);
  }
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

// Simple price fetcher (for demo - replace with real API calls)
async function fetchPrice(exchange, symbol) {
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
  const START_SIGNAL_FILE = '/app/data/START_SIGNAL';
  
  while (true) {
    // Check for start signal file OR environment variable
    const startSignalExists = fs.existsSync(START_SIGNAL_FILE);
    const envEnabled = process.env.STRATEGY_ENABLED === 'true';
    
    if (startSignalExists || envEnabled) {
      console.log('[🐟 PIRANHA] ✅ START SIGNAL RECEIVED! Beginning trading...');
      break;
    }
    
    // Log waiting status every 30 seconds
    console.log('[🐟 PIRANHA] ⏳ Waiting for start command... (check every 10s)');
    await sleep(10000);
  }
  
  loadState();
  state.active = true;
  state.startTime = state.startTime || new Date().toISOString();
  saveState();
  
  console.log('[🐟 PIRANHA] Strategy is now ACTIVE');
  console.log('[🐟 PIRANHA] Monitoring positions and looking for entry opportunities...');
  
  // Main loop - runs forever (24/7)
  let loopCount = 0;
  while (true) {
    try {
      loopCount++;
      
      // Check each open position for profit target
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
        
        // Check if profit target reached
        if (isProfitTargetReached(netPnL, position.isLeverage)) {
          console.log('[🐟 PIRANHA] 🎯 PROFIT TARGET HIT!');
          console.log('  Symbol:', position.symbol);
          console.log('  Side:', position.side);
          console.log('  Entry:', position.entryPrice);
          console.log('  Exit:', currentPrice);
          console.log('  P&L: $' + netPnL.toFixed(2));
          
          // Log the completed trade
          const completedTrade = {
            ...position,
            exitPrice: currentPrice,
            exitTime: new Date().toISOString(),
            netPnL: netPnL,
            status: 'closed'
          };
          logTrade(completedTrade);
          
          // Update totals
          state.totalTrades++;
          state.totalPnL += netPnL;
          
          // Remove from positions (will re-enter immediately)
          state.positions = state.positions.filter(p => p.id !== position.id);
          
          console.log('[🐟 PIRANHA] Total trades:', state.totalTrades, '| Total P&L: $' + state.totalPnL.toFixed(2));
        }
      }
      
      saveState();
      
      // STRICT RULE: 100ms monitoring interval for fast profit capture
      await sleep(100);
      
      // Log status every 600 loops (every minute at 100ms)
      if (loopCount % 600 === 0) {
        console.log('[🐟 PIRANHA] Status: ' + state.positions.length + ' positions | ' + state.totalTrades + ' trades | $' + state.totalPnL.toFixed(2) + ' P&L');
      }
      
    } catch (err) {
      console.error('[🐟 PIRANHA] Loop error:', err.message);
      state.errors.push({ time: new Date().toISOString(), error: err.message });
      if (state.errors.length > 100) state.errors = state.errors.slice(-100);
      saveState();
      await sleep(5000); // Wait 5s on error
    }
  }
}

// ============== STARTUP ==============
console.log('[🐟 PIRANHA] Strategy Runner initializing...');
console.log('[🐟 PIRANHA] Config:', {
  minPosition: CONFIG.MIN_POSITION_SIZE,
  maxPosition: CONFIG.MAX_POSITION_SIZE,
  profitSpot: CONFIG.PROFIT_TARGET_SPOT,
  profitLeverage: CONFIG.PROFIT_TARGET_LEVERAGE,
  enabled: CONFIG.ENABLED
});

// Start the strategy
runPiranha().catch(err => {
  console.error('[🐟 PIRANHA] Fatal error:', err);
  process.exit(1);
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  console.log('[🐟 PIRANHA] Received SIGTERM, saving state...');
  state.active = false;
  saveState();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[🐟 PIRANHA] Received SIGINT, saving state...');
  state.active = false;
  saveState();
  process.exit(0);
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

# Supabase Connection (for trade logging)
SUPABASE_URL=https://iibdlazwkossyelyroap.supabase.co
SUPABASE_ANON_KEY=your_anon_key
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

# Enable systemd service for boot persistence
log_info "Enabling Profit Piranha service for auto-start..."
systemctl daemon-reload
systemctl enable hft-bot

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
