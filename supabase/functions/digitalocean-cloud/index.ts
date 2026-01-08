import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DO_API_BASE = 'https://api.digitalocean.com/v2';

// HFT Bot installation script - runs on boot via user_data
const getInstallScript = (region: string) => `#!/bin/bash
set -e

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          HFT Bot Installation - ${region.toUpperCase()} VPS                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m'

log_info() { echo -e "\${GREEN}[INFO]\${NC} \$1"; }
log_warn() { echo -e "\${YELLOW}[WARN]\${NC} \$1"; }
log_error() { echo -e "\${RED}[ERROR]\${NC} \$1"; }

log_info "Starting HFT Bot installation..."

# System updates
apt-get update -qq
apt-get upgrade -y -qq

# Install dependencies
apt-get install -y -qq docker.io docker-compose curl wget htop net-tools jq ufw fail2ban

# Enable Docker
systemctl enable docker
systemctl start docker

# Create HFT directory structure
mkdir -p /opt/hft-bot/{app,logs,config,data}
cd /opt/hft-bot

# Create docker-compose.yml
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
      - TZ=Asia/Singapore
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
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 8080/tcp comment 'Health check'
ufw allow 443/tcp comment 'HTTPS API'
ufw reload

# Configure fail2ban
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
systemctl daemon-reload
systemctl enable hft-bot
systemctl start hft-bot

sleep 5

# Verify installation
if curl -s http://localhost:8080/health | jq -e '.status == "ok"' > /dev/null 2>&1; then
  log_info "Health check: PASSED"
else
  log_warn "Health check not responding yet"
fi

DROPLET_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                 INSTALLATION COMPLETE!                     ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  Server: \$DROPLET_IP (Singapore)                          ║"
echo "║  Health: http://\$DROPLET_IP:8080/health                   ║"
echo "║  Path:   /opt/hft-bot/                                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
`;

async function doRequest(endpoint: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`${DO_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, dropletId, region = 'sgp1' } = await req.json();
    const token = Deno.env.get('DIGITALOCEAN_API_TOKEN');

    if (!token) {
      console.error('[digitalocean-cloud] No API token configured');
      return new Response(
        JSON.stringify({ success: false, error: 'DigitalOcean API token not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`[digitalocean-cloud] Action: ${action}, Region: ${region}`);

    // Validate API key
    if (action === 'validate') {
      const result = await doRequest('/account', token);
      if (result.ok) {
        return new Response(
          JSON.stringify({ success: true, account: result.data.account }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid API token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Create SSH Key (required for VPS access)
    if (action === 'create-ssh-key') {
      const { name, publicKey } = await req.json().catch(() => ({}));
      console.log('[digitalocean-cloud] Creating SSH key:', name);
      
      const result = await doRequest('/account/keys', token, {
        method: 'POST',
        body: JSON.stringify({ name, public_key: publicKey }),
      });

      if (!result.ok) {
        // Key might already exist, try to find it
        const existingKeys = await doRequest('/account/keys', token);
        const existingKey = existingKeys.data.ssh_keys?.find((k: any) => k.name === name);
        if (existingKey) {
          return new Response(
            JSON.stringify({ success: true, keyId: existingKey.id, fingerprint: existingKey.fingerprint }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ success: false, error: result.data.message || 'Failed to create SSH key' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          keyId: result.data.ssh_key?.id, 
          fingerprint: result.data.ssh_key?.fingerprint 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create instance (alias for deploy - matches deploy-bot expectations)
    if (action === 'create-instance') {
      const { region: instanceRegion = 'sgp1', plan = 's-1vcpu-1gb', label, userData, sshKeyName } = await req.json().catch(() => ({}));
      console.log('[digitalocean-cloud] Creating instance via create-instance action in', instanceRegion || region);
      
      const installScript = getInstallScript(instanceRegion || region);
      
      const dropletPayload: Record<string, unknown> = {
        name: label || `hft-bot-${instanceRegion || region}`,
        region: instanceRegion || region,
        size: plan,
        image: 'ubuntu-24-04-x64',
        user_data: userData || installScript,
        tags: ['hft-bot', 'trading', 'auto-deployed'],
        monitoring: true,
      };

      const result = await doRequest('/droplets', token, {
        method: 'POST',
        body: JSON.stringify(dropletPayload),
      });

      if (!result.ok) {
        return new Response(
          JSON.stringify({ success: false, error: result.data.message || 'Failed to create instance' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          instanceId: result.data.droplet.id,
          ipAddress: null, // Will be populated after boot
          status: 'creating',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get instance status (matches deploy-bot expectations)
    if (action === 'get-instance') {
      const { instanceId: getInstanceId } = await req.json().catch(() => ({}));
      if (!getInstanceId) {
        return new Response(
          JSON.stringify({ success: false, error: 'instanceId required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const result = await doRequest(`/droplets/${getInstanceId}`, token);
      
      if (!result.ok) {
        return new Response(
          JSON.stringify({ success: false, error: 'Instance not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      const droplet = result.data.droplet;
      const publicIp = droplet.networks?.v4?.find((n: any) => n.type === 'public')?.ip_address;

      return new Response(
        JSON.stringify({
          success: true,
          instanceId: droplet.id,
          status: droplet.status === 'active' ? 'running' : droplet.status,
          ipAddress: publicIp || null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deploy new Droplet
    if (action === 'deploy') {
      console.log('[digitalocean-cloud] Creating Droplet in', region);
      
      const installScript = getInstallScript(region);
      
      const dropletPayload = {
        name: `hft-bot-${region}`,
        region: region,
        size: 's-1vcpu-1gb', // 1GB RAM, 1 vCPU - $6/mo
        image: 'ubuntu-24-04-x64',
        user_data: installScript,
        tags: ['hft-bot', 'trading', 'auto-deployed'],
        monitoring: true,
      };

      const result = await doRequest('/droplets', token, {
        method: 'POST',
        body: JSON.stringify(dropletPayload),
      });

      if (!result.ok) {
        console.error('[digitalocean-cloud] Droplet creation failed:', result.data);
        return new Response(
          JSON.stringify({ success: false, error: result.data.message || 'Failed to create Droplet' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const droplet = result.data.droplet;
      console.log('[digitalocean-cloud] Droplet created:', droplet.id);

      return new Response(
        JSON.stringify({
          success: true,
          dropletId: droplet.id,
          name: droplet.name,
          region: droplet.region.slug,
          status: droplet.status,
          message: 'Droplet creation initiated. Waiting for IP assignment...',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Droplet status and IP
    if (action === 'status') {
      if (!dropletId) {
        return new Response(
          JSON.stringify({ success: false, error: 'dropletId required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const result = await doRequest(`/droplets/${dropletId}`, token);
      
      if (!result.ok) {
        return new Response(
          JSON.stringify({ success: false, error: 'Droplet not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      const droplet = result.data.droplet;
      const publicIp = droplet.networks?.v4?.find((n: any) => n.type === 'public')?.ip_address;

      return new Response(
        JSON.stringify({
          success: true,
          dropletId: droplet.id,
          name: droplet.name,
          status: droplet.status,
          ip: publicIp || null,
          region: droplet.region.slug,
          created_at: droplet.created_at,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Configure firewall
    if (action === 'configure-firewall') {
      if (!dropletId) {
        return new Response(
          JSON.stringify({ success: false, error: 'dropletId required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const firewallPayload = {
        name: `hft-firewall-${dropletId}`,
        inbound_rules: [
          { protocol: 'tcp', ports: '22', sources: { addresses: ['0.0.0.0/0', '::/0'] } },
          { protocol: 'tcp', ports: '8080', sources: { addresses: ['0.0.0.0/0', '::/0'] } },
          { protocol: 'tcp', ports: '443', sources: { addresses: ['0.0.0.0/0', '::/0'] } },
        ],
        outbound_rules: [
          { protocol: 'tcp', ports: 'all', destinations: { addresses: ['0.0.0.0/0', '::/0'] } },
          { protocol: 'udp', ports: 'all', destinations: { addresses: ['0.0.0.0/0', '::/0'] } },
          { protocol: 'icmp', destinations: { addresses: ['0.0.0.0/0', '::/0'] } },
        ],
        droplet_ids: [parseInt(dropletId)],
      };

      const result = await doRequest('/firewalls', token, {
        method: 'POST',
        body: JSON.stringify(firewallPayload),
      });

      if (!result.ok) {
        console.error('[digitalocean-cloud] Firewall creation failed:', result.data);
        // Non-critical, continue anyway
        return new Response(
          JSON.stringify({ success: true, warning: 'Firewall creation skipped', details: result.data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, firewallId: result.data.firewall.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Destroy Droplet
    if (action === 'destroy') {
      if (!dropletId) {
        return new Response(
          JSON.stringify({ success: false, error: 'dropletId required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const result = await doRequest(`/droplets/${dropletId}`, token, { method: 'DELETE' });
      
      return new Response(
        JSON.stringify({ success: true, message: 'Droplet destruction initiated' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error) {
    console.error('[digitalocean-cloud] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
