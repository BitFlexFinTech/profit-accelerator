import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INSTALL_SCRIPT = `#!/bin/bash
set -e

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          HFT Bot Installation - Tokyo VPS                  ║"
echo "║          Server: 167.179.83.239                            ║"
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

# Create health check server
log_info "Creating health check endpoint..."
cat > app/health.js << 'HEALTH_EOF'
const http = require('http');
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

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

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
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(8080, '0.0.0.0', () => {
  console.log('[HFT] Health check server running on port 8080');
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
Description=HFT Trading Bot
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/hft-bot
ExecStartPre=/usr/bin/docker-compose pull
ExecStart=/usr/bin/docker-compose up
ExecStop=/usr/bin/docker-compose down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE_EOF

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
echo "║  📍 Server: 167.179.83.239 (Tokyo)                         ║"
echo "║  🔍 Health: http://167.179.83.239:8080/health              ║"
echo "║  📁 Path:   /opt/hft-bot/                                  ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  Next Steps:                                               ║"
echo "║  1. Add exchange credentials to /opt/hft-bot/config/.env   ║"
echo "║  2. Deploy strategy to /opt/hft-bot/app/                   ║"
echo "║  3. systemctl restart hft-bot                              ║"
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
        serverIp: '167.179.83.239',
        region: 'Tokyo (NRT)',
        installCommand: 'curl -sSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | sudo bash',
        healthEndpoint: 'http://167.179.83.239:8080/health',
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
