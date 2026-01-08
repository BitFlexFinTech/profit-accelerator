import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INSTALL_SCRIPT = `#!/bin/bash
set -e

# Get server IP dynamically
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          HFT Trading Bot Installation                      ║"
echo "║          Server IP: \$SERVER_IP                             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m'

log_info() { echo -e "\${GREEN}[INFO]\${NC} $1"; }
log_warn() { echo -e "\${YELLOW}[WARN]\${NC} $1"; }
log_error() { echo -e "\${RED}[ERROR]\${NC} $1"; }

# Check root
if [ "$EUID" -ne 0 ]; then
  log_error "Please run as root: sudo bash"
  exit 1
fi

log_info "Starting HFT Bot installation..."
log_info "Detected Server IP: \$SERVER_IP"

# System updates
log_info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# Install dependencies
log_info "Installing dependencies..."
apt-get install -y -qq docker.io docker-compose curl wget htop net-tools jq ufw fail2ban

# Enable Docker
log_info "Configuring Docker..."
systemctl enable docker
systemctl start docker

# Create HFT directory structure
log_info "Creating directory structure..."
mkdir -p /opt/hft-bot/{app,logs,config,data}
cd /opt/hft-bot

# Create docker-compose.yml
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
    environment:
      - NODE_ENV=production
      - TZ=Asia/Tokyo
    restart: always
    network_mode: host
    command: ["node", "health.js"]
    
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
  version: '1.0.0'
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
});
HEALTH_EOF

# Create package.json
cat > app/package.json << 'PKG_EOF'
{
  "name": "hft-bot",
  "version": "1.0.0",
  "main": "health.js",
  "scripts": {
    "start": "node health.js",
    "health": "node health.js"
  }
}
PKG_EOF

# Create systemd service
log_info "Creating systemd service..."
cat > /etc/systemd/system/hft-bot.service << 'SERVICE_EOF'
[Unit]
Description=HFT Trading Bot with Self-Healing Watchdog
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=notify
WorkingDirectory=/opt/hft-bot
ExecStartPre=/usr/bin/docker-compose pull
ExecStart=/usr/bin/docker-compose up
ExecStop=/usr/bin/docker-compose down
Restart=always
RestartSec=3
WatchdogSec=10
TimeoutStartSec=30
TimeoutStopSec=30

# Ensure service restarts on any failure
RestartForceExitStatus=SIGKILL SIGTERM

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

# Enable and start HFT service
log_info "Starting HFT Bot service..."
systemctl daemon-reload
systemctl enable hft-bot
systemctl start hft-bot

# Wait for health check
sleep 5

# Verify installation
log_info "Verifying installation..."
if curl -s http://localhost:8080/health | jq -e '.status == "ok"' > /dev/null 2>&1; then
  log_info "Health check: ✓ PASSED"
else
  log_warn "Health check not responding yet (may take a moment)"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                 INSTALLATION COMPLETE!                     ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  📍 Server: \$SERVER_IP                                     ║"
echo "║  🔍 Health: http://\$SERVER_IP:8080/health                  ║"
echo "║  📁 Path:   /opt/hft-bot/                                  ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  Next Steps:                                               ║"
echo "║  1. Whitelist \$SERVER_IP on your exchanges                 ║"
echo "║  2. Add exchange credentials to /opt/hft-bot/config/.env   ║"
echo "║  3. Deploy strategy to /opt/hft-bot/app/                   ║"
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
        message: 'Dynamic IP detection - run the script to see your server IP',
        installCommand: 'curl -sSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | sudo bash',
        healthEndpoint: 'http://<YOUR-SERVER-IP>:8080/health',
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
