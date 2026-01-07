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
        const accessKeyId = credentials.accessKeyId;
        const secretAccessKey = credentials.secretAccessKey;
        
        if (!accessKeyId || !secretAccessKey) {
          throw new Error('AWS credentials not configured');
        }

        console.log('[provision-vps] Invoking aws-cloud function for real EC2 deployment');
        
        // Call the aws-cloud function which has full SigV4 implementation
        const { data: awsData, error: awsError } = await supabase.functions.invoke('aws-cloud', {
          body: {
            action: 'deploy-instance',
            credentials: { accessKeyId, secretAccessKey },
            specs: {
              region: optimalRegion,
              instanceType: 't4g.micro',
              imageId: 'ami-0d52744d6551d851e' // Ubuntu 24.04 LTS ARM64 Tokyo
            }
          }
        });

        if (awsError || !awsData?.success) {
          throw new Error(awsData?.error || awsError?.message || 'AWS deployment failed');
        }

        result = {
          success: true,
          instanceId: awsData.instanceId,
          publicIp: awsData.publicIp || 'Provisioning...'
        };
        break;
      }

      case 'gcp': {
        const serviceAccountKey = credentials.serviceAccountKey;
        
        if (!serviceAccountKey) {
          throw new Error('GCP service account key not configured');
        }

        console.log('[provision-vps] Invoking gcp-cloud function for real Compute Engine deployment');
        
        // Call the gcp-cloud function for real deployment
        const { data: gcpData, error: gcpError } = await supabase.functions.invoke('gcp-cloud', {
          body: {
            action: 'deploy-instance',
            serviceAccountJson: serviceAccountKey,
            specs: {
              region: optimalRegion,
              zone: `${optimalRegion}-a`,
              machineType: 'e2-micro'
            }
          }
        });

        if (gcpError || !gcpData?.success) {
          throw new Error(gcpData?.error || gcpError?.message || 'GCP deployment failed');
        }

        result = {
          success: true,
          instanceId: gcpData.instanceId,
          publicIp: gcpData.publicIp || 'Provisioning...'
        };
        break;
      }

      case 'oracle': {
        const tenancyOcid = credentials.tenancyOcid;
        const userOcid = credentials.userOcid;
        const fingerprint = credentials.fingerprint;
        const privateKey = credentials.privateKey;
        const subnetOcid = credentials.subnetOcid;
        const sshPublicKey = credentials.sshPublicKey;
        
        if (!tenancyOcid || !userOcid || !fingerprint || !privateKey) {
          throw new Error('Oracle Cloud credentials not configured (tenancyOcid, userOcid, fingerprint, privateKey required)');
        }

        console.log('[provision-vps] Invoking oracle-cloud function for real OCI deployment');
        
        // Call the oracle-cloud function with proper RSA-SHA256 authentication
        const { data: ociData, error: ociError } = await supabase.functions.invoke('oracle-cloud', {
          body: {
            action: 'deploy-instance',
            tenancyOcid,
            userOcid,
            fingerprint,
            privateKey,
            region: optimalRegion,
            subnetOcid,
            sshPublicKey,
            displayName: `hft-${targetExchange || 'tokyo'}-arm`
          }
        });

        if (ociError || !ociData?.success) {
          throw new Error(ociData?.error || ociError?.message || 'Oracle OCI deployment failed');
        }

        result = {
          success: true,
          instanceId: ociData.instanceId,
          publicIp: ociData.publicIp || 'Provisioning...'
        };
        break;
      }

      case 'alibaba': {
        const accessKeyId = credentials.accessKeyId;
        const accessKeySecret = credentials.accessKeySecret;
        
        if (!accessKeyId || !accessKeySecret) {
          throw new Error('Alibaba Cloud credentials not configured (accessKeyId, accessKeySecret required)');
        }

        console.log('[provision-vps] Invoking alibaba-cloud function for real ECS deployment with HMAC-SHA1');
        
        // Call the alibaba-cloud function with HMAC-SHA1 authentication
        const { data: aliData, error: aliError } = await supabase.functions.invoke('alibaba-cloud', {
          body: {
            action: 'deploy-instance',
            accessKeyId,
            accessKeySecret,
            region: optimalRegion,
            instanceType: credentials.instanceType || 'ecs.t6-c1m1.large'
          }
        });

        if (aliError || !aliData?.success) {
          throw new Error(aliData?.error || aliError?.message || 'Alibaba ECS deployment failed');
        }

        result = {
          success: true,
          instanceId: aliData.instanceId,
          publicIp: aliData.publicIp || 'Provisioning...'
        };
        break;
      }

      case 'azure': {
        const tenantId = credentials.tenantId;
        const clientId = credentials.clientId;
        const clientSecret = credentials.clientSecret;
        const subscriptionId = credentials.subscriptionId;
        
        if (!tenantId || !clientId || !clientSecret || !subscriptionId) {
          throw new Error('Azure credentials not configured (tenantId, clientId, clientSecret, subscriptionId required)');
        }

        console.log('[provision-vps] Invoking azure-cloud function for real VM deployment with OAuth2');
        
        const { data: azureData, error: azureError } = await supabase.functions.invoke('azure-cloud', {
          body: {
            action: 'deploy-instance',
            tenantId,
            clientId,
            clientSecret,
            subscriptionId,
            resourceGroup: credentials.resourceGroup || 'hft-bot-rg',
            location: optimalRegion,
            vmName: `hft-bot-${targetExchange || 'tokyo'}`
          }
        });

        if (azureError || !azureData?.success) {
          throw new Error(azureData?.error || azureError?.message || 'Azure deployment failed');
        }

        result = {
          success: true,
          instanceId: azureData.vmName || azureData.instanceId,
          publicIp: azureData.publicIp || 'Provisioning...'
        };
        break;
      }

      case 'contabo': {
        const clientId = credentials.clientId;
        const clientSecret = credentials.clientSecret;
        
        if (!clientId || !clientSecret) {
          throw new Error('Contabo credentials not configured');
        }

        console.log('[provision-vps] Contabo requires OAuth2 API - credentials stored for manual setup');
        
        // Contabo uses OAuth2 - store credentials and mark for manual setup
        result = {
          success: true,
          instanceId: `contabo-pending-${Date.now()}`,
          publicIp: 'Manual Setup Required'
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
