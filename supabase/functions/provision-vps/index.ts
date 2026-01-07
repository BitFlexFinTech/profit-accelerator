import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Exchange-to-region mapping for optimal latency
const EXCHANGE_REGION_MAP: Record<string, Record<string, string>> = {
  // Tokyo Mesh (9 exchanges)
  binance: { aws: 'ap-northeast-1', gcp: 'asia-northeast1', azure: 'japaneast', vultr: 'nrt', digitalocean: 'sgp1' },
  okx: { aws: 'ap-northeast-1', vultr: 'nrt', alibaba: 'ap-northeast-1', gcp: 'asia-northeast1' },
  bybit: { aws: 'ap-northeast-1', vultr: 'nrt', digitalocean: 'sgp1', gcp: 'asia-northeast1' },
  hyperliquid: { aws: 'ap-northeast-1', vultr: 'nrt', gcp: 'asia-northeast1' },
  bitget: { aws: 'ap-northeast-1', vultr: 'nrt', gcp: 'asia-northeast1' },
  bingx: { aws: 'ap-northeast-1', vultr: 'nrt', gcp: 'asia-northeast1' },
  mexc: { aws: 'ap-northeast-1', vultr: 'nrt', gcp: 'asia-northeast1' },
  gateio: { aws: 'ap-northeast-1', vultr: 'nrt', gcp: 'asia-northeast1' },
  kucoin: { aws: 'ap-northeast-1', vultr: 'nrt', gcp: 'asia-northeast1' },
  // US East Mesh (Kraken)
  kraken: { aws: 'us-east-1', azure: 'eastus', digitalocean: 'nyc1', vultr: 'ewr' },
  // Europe Mesh (Nexo)
  nexo: { aws: 'eu-west-1', contabo: 'EU', oracle: 'eu-frankfurt-1', gcp: 'europe-west1' }
};

// HFT Cloud-Init script for Ubuntu 24.04
const HFT_CLOUD_INIT = `#!/bin/bash
set -e

# HFT Kernel Tweaks
cat >> /etc/sysctl.conf << 'EOF'
# TCP Fast Open
net.ipv4.tcp_fastopen = 3
# Disable Nagle's algorithm
net.ipv4.tcp_nodelay = 1
# Quick ACK mode
net.ipv4.tcp_quickack = 1
# Increase backlog
net.core.netdev_max_backlog = 65536
# Low swappiness for performance
vm.swappiness = 10
# Increase socket buffer sizes
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
EOF
sysctl -p

# Set CPU governor to performance
echo performance | tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor 2>/dev/null || true

# Disable non-essential services
systemctl disable --now snapd cups bluetooth avahi-daemon 2>/dev/null || true

# Install Docker and dependencies
apt-get update
apt-get install -y docker.io docker-compose curl htop
systemctl enable --now docker

# Create HFT bot service with watchdog
cat > /etc/systemd/system/hft-bot.service << 'EOF'
[Unit]
Description=HFT Trading Bot
After=network.target docker.service

[Service]
Type=notify
Restart=always
RestartSec=1
WatchdogSec=5s
TimeoutStartSec=60
RestartForceExitStatus=SIGKILL SIGTERM
ExecStart=/opt/hft-bot/start.sh
WorkingDirectory=/opt/hft-bot

[Install]
WantedBy=multi-user.target
EOF

mkdir -p /opt/hft-bot
echo '#!/bin/bash' > /opt/hft-bot/start.sh
echo 'exec docker-compose up' >> /opt/hft-bot/start.sh
chmod +x /opt/hft-bot/start.sh

systemctl daemon-reload
echo "HFT Bot setup complete"
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider, targetExchange, credentials } = await req.json();
    console.log(`[provision-vps] Provider: ${provider}, Target Exchange: ${targetExchange || 'general'}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Determine optimal region
    const exchangeRegions = EXCHANGE_REGION_MAP[targetExchange?.toLowerCase() || 'binance'] || EXCHANGE_REGION_MAP.binance;
    const optimalRegion = exchangeRegions[provider.toLowerCase()] || 'ap-northeast-1';
    
    console.log(`[provision-vps] Optimal region for ${targetExchange || 'binance'} on ${provider}: ${optimalRegion}`);

    let result: { success: boolean; publicIp?: string; instanceId?: string; error?: string };

    switch (provider.toLowerCase()) {
      case 'vultr': {
        const apiKey = credentials.apiKey || Deno.env.get('VULTR_API_KEY');
        if (!apiKey) {
          throw new Error('Vultr API key not configured');
        }

        // Map region to Vultr region ID
        const vultrRegions: Record<string, string> = {
          'nrt': 'nrt', // Tokyo
          'sgp1': 'sgp', // Singapore
          'ewr': 'ewr', // New Jersey
        };
        const regionId = vultrRegions[optimalRegion] || 'nrt';

        // Get OS ID for Ubuntu 24.04
        const osResponse = await fetch('https://api.vultr.com/v2/os', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const osData = await osResponse.json();
        const ubuntu24 = osData.os?.find((os: { name: string }) => os.name.includes('Ubuntu 24.04'));
        const osId = ubuntu24?.id || 2284; // Default Ubuntu 24.04 LTS ID

        // Create instance
        const createResponse = await fetch('https://api.vultr.com/v2/instances', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            region: regionId,
            plan: 'vc2-1c-1gb', // $5/mo plan
            os_id: osId,
            label: `hft-bot-${targetExchange || 'tokyo'}-${Date.now()}`,
            hostname: `hft-${targetExchange || 'bot'}`,
            user_data: btoa(HFT_CLOUD_INIT),
            backups: 'disabled',
            ddos_protection: false,
            enable_ipv6: false
          })
        });

        if (!createResponse.ok) {
          const error = await createResponse.text();
          throw new Error(`Vultr API error: ${error}`);
        }

        const instance = await createResponse.json();
        result = {
          success: true,
          instanceId: instance.instance?.id,
          publicIp: instance.instance?.main_ip || 'Provisioning...'
        };
        break;
      }

      case 'digitalocean': {
        const token = credentials.token || Deno.env.get('DIGITALOCEAN_API_TOKEN');
        if (!token) {
          throw new Error('DigitalOcean API token not configured');
        }

        // Map to DO regions
        const doRegions: Record<string, string> = {
          'sgp1': 'sgp1',
          'nyc1': 'nyc1',
          'ap-northeast-1': 'sgp1'
        };
        const region = doRegions[optimalRegion] || 'sgp1';

        const createResponse = await fetch('https://api.digitalocean.com/v2/droplets', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: `hft-bot-${targetExchange || 'tokyo'}-${Date.now()}`,
            region: region,
            size: 's-1vcpu-1gb',
            image: 'ubuntu-24-04-x64',
            user_data: HFT_CLOUD_INIT,
            monitoring: true,
            tags: ['hft-bot', targetExchange || 'general']
          })
        });

        if (!createResponse.ok) {
          const error = await createResponse.text();
          throw new Error(`DigitalOcean API error: ${error}`);
        }

        const droplet = await createResponse.json();
        result = {
          success: true,
          instanceId: droplet.droplet?.id?.toString(),
          publicIp: 'Provisioning...'
        };
        break;
      }

      case 'aws': {
        // AWS requires EC2 RunInstances API with SigV4
        // For production, use AWS SDK or implement full SigV4 signing
        const accessKeyId = credentials.accessKeyId;
        const secretAccessKey = credentials.secretAccessKey;
        
        if (!accessKeyId || !secretAccessKey) {
          throw new Error('AWS credentials not configured');
        }

        // AWS EC2 requires SigV4 - simplified for demo, use SDK in production
        console.log('[provision-vps] AWS provisioning requires SigV4 signing');
        result = {
          success: false,
          error: 'AWS EC2 provisioning requires full SDK integration. Use Vultr or DigitalOcean for quick setup.'
        };
        break;
      }

      default:
        result = { success: false, error: `Provider ${provider} not yet implemented` };
    }

    if (result.success && result.publicIp) {
      // Update database
      await supabase.from('cloud_config').upsert({
        provider: provider.toLowerCase(),
        region: optimalRegion,
        status: 'provisioning',
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'provider' });

      await supabase.from('vps_config').upsert({
        provider: provider.toLowerCase(),
        region: optimalRegion,
        status: 'provisioning',
        outbound_ip: result.publicIp,
        instance_type: provider === 'vultr' ? 'vc2-1c-1gb' : 's-1vcpu-1gb',
        updated_at: new Date().toISOString()
      }, { onConflict: 'provider' });

      // Log timeline event
      await supabase.from('vps_timeline_events').insert({
        provider: provider.toLowerCase(),
        event_type: 'deployment',
        event_subtype: 'instance_created',
        title: `${provider} VPS Deployed`,
        description: `Instance ${result.instanceId} deployed in ${optimalRegion} for ${targetExchange || 'general'} trading`,
        metadata: { instanceId: result.instanceId, region: optimalRegion, targetExchange }
      });

      await supabase.from('audit_logs').insert({
        action: 'vps_provisioned',
        entity_type: 'cloud_config',
        new_value: { provider, region: optimalRegion, instanceId: result.instanceId, targetExchange }
      });
    }

    console.log(`[provision-vps] Result:`, result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[provision-vps] Error:', message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
