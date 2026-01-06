import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BITLAUNCH_API = 'https://app.bitlaunch.io/api';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, ...params } = await req.json();
    console.log(`[bitlaunch-cloud] Action: ${action}`);

    const makeRequest = async (endpoint: string, method = 'GET', body?: any) => {
      const response = await fetch(`${BITLAUNCH_API}${endpoint}`, {
        method,
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return response.json();
    };

    switch (action) {
      case 'validate-api-key': {
        try {
          const data = await makeRequest('/account');
          
          if (data.id) {
            return new Response(
              JSON.stringify({ 
                success: true, 
                valid: true,
                balance: data.balance,
                email: data.email,
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          return new Response(
            JSON.stringify({ success: false, valid: false }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          return new Response(
            JSON.stringify({ success: false, valid: false, error: errorMessage }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'list-hosts': {
        const data = await makeRequest('/hosts');
        
        // BitLaunch supports: DigitalOcean, Vultr, Linode, BitLaunch First-Party
        return new Response(
          JSON.stringify({ success: true, hosts: data.hosts || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'list-sizes': {
        const { hostId } = params;
        const data = await makeRequest(`/hosts/${hostId}/sizes`);
        
        return new Response(
          JSON.stringify({ success: true, sizes: data.sizes || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'list-regions': {
        const { hostId } = params;
        const data = await makeRequest(`/hosts/${hostId}/regions`);
        
        // Filter for Tokyo regions
        const tokyoRegions = (data.regions || []).filter((r: any) => 
          r.slug?.includes('tok') || r.slug?.includes('jp') || r.name?.toLowerCase().includes('tokyo')
        );
        
        return new Response(
          JSON.stringify({ success: true, regions: tokyoRegions }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'create-ssh-key': {
        const { name, publicKey } = params;
        
        const data = await makeRequest('/ssh-keys', 'POST', {
          name: name || 'hft-bot-key',
          publicKey,
        });

        return new Response(
          JSON.stringify({ success: true, sshKey: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'deploy-server': {
        const { hostId, regionSlug, sizeSlug, sshKeyIds, name } = params;
        
        // HFT Bot installation script
        const initScript = `#!/bin/bash
set -e
apt-get update
apt-get install -y docker.io docker-compose curl wget
systemctl enable docker
systemctl start docker

mkdir -p /opt/hft-bot
cd /opt/hft-bot

# Create docker-compose for HFT bot
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  hft-bot:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - ./app:/app
    restart: always
    command: ["node", "bot.js"]
EOF

echo "HFT Bot environment initialized successfully"
echo "Server ready for trading at $(date)"
`;

        const data = await makeRequest('/servers', 'POST', {
          host: hostId || 'digitalocean',
          region: regionSlug || 'tok1',
          size: sizeSlug || 'nibble-1024',
          image: 'ubuntu-24-04-x64',
          sshKeyIds: sshKeyIds || [],
          name: name || 'hft-bot-tokyo',
          initScript,
        });

        if (data.id) {
          // Update cloud_config
          await supabase
            .from('cloud_config')
            .upsert({
              provider: 'bitlaunch',
              region: regionSlug || 'tok1',
              instance_type: sizeSlug || 'nibble-1024',
              is_active: true,
              status: 'deploying',
              credentials: { serverId: data.id, host: hostId },
            }, { onConflict: 'provider' });

          return new Response(
            JSON.stringify({ success: true, server: data }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create server' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-server-status': {
        const { serverId } = params;
        const data = await makeRequest(`/servers/${serverId}`);

        if (data.status === 'running' && data.ipAddress) {
          // Update cloud_config with IP
          await supabase
            .from('cloud_config')
            .update({ status: 'running' })
            .eq('provider', 'bitlaunch');

          await supabase
            .from('vps_config')
            .upsert({
              provider: 'bitlaunch',
              region: data.region,
              status: 'running',
              outbound_ip: data.ipAddress,
            }, { onConflict: 'provider' });
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            status: data.status,
            publicIp: data.ipAddress,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete-server': {
        const { serverId } = params;
        await makeRequest(`/servers/${serverId}`, 'DELETE');

        await supabase
          .from('cloud_config')
          .update({ status: 'not_configured', is_active: false })
          .eq('provider', 'bitlaunch');

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Unknown action' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[bitlaunch-cloud] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});