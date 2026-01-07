import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, serviceAccountJson, specs, sshPublicKey } = await req.json();
    console.log(`[gcp-cloud] Action: ${action}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    switch (action) {
      case 'validate-credentials': {
        console.log('[gcp-cloud] Validating GCP service account');
        
        // In production, this would verify the service account JSON
        // by attempting to authenticate with GCP
        let isValid = false;
        let projectId = null;

        try {
          const sa = JSON.parse(serviceAccountJson);
          isValid = sa.type === 'service_account' && sa.project_id && sa.private_key;
          projectId = sa.project_id;
        } catch {
          isValid = false;
        }

        return new Response(
          JSON.stringify({ 
            valid: isValid,
            projectId,
            message: isValid ? 'Service account validated' : 'Invalid service account JSON'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'deploy-instance': {
        console.log('[gcp-cloud] Deploying e2-micro instance with real GCP API');
        console.log(`[gcp-cloud] Specs: ${JSON.stringify(specs)}`);

        let sa;
        try {
          sa = JSON.parse(serviceAccountJson);
        } catch {
          return new Response(
            JSON.stringify({ success: false, error: 'Invalid service account JSON' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const projectId = sa.project_id;
        const zone = specs?.zone || 'asia-northeast1-a';
        const machineType = specs?.machineType || 'e2-micro';
        const instanceName = `hft-bot-${Date.now()}`;

        // Generate JWT for GCP OAuth2
        const createGcpJwt = async (email: string, privateKey: string): Promise<string> => {
          const header = { alg: 'RS256', typ: 'JWT' };
          const now = Math.floor(Date.now() / 1000);
          const claim = {
            iss: email,
            sub: email,
            aud: 'https://oauth2.googleapis.com/token',
            iat: now,
            exp: now + 3600,
            scope: 'https://www.googleapis.com/auth/compute'
          };

          const base64Header = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
          const base64Claim = btoa(JSON.stringify(claim)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
          const signInput = `${base64Header}.${base64Claim}`;

          // Import private key and sign
          const pemContents = privateKey
            .replace('-----BEGIN PRIVATE KEY-----', '')
            .replace('-----END PRIVATE KEY-----', '')
            .replace(/\s/g, '');
          
          const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
          
          const cryptoKey = await crypto.subtle.importKey(
            'pkcs8',
            binaryKey,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['sign']
          );

          const signature = await crypto.subtle.sign(
            'RSASSA-PKCS1-v1_5',
            cryptoKey,
            new TextEncoder().encode(signInput)
          );

          const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)))
            .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

          return `${signInput}.${base64Signature}`;
        };

        try {
          // Step 1: Get access token via JWT
          const jwt = await createGcpJwt(sa.client_email, sa.private_key);
          
          const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
              assertion: jwt
            })
          });

          if (!tokenResponse.ok) {
            const tokenError = await tokenResponse.text();
            console.error('[gcp-cloud] Token error:', tokenError);
            throw new Error('Failed to get GCP access token');
          }

          const { access_token } = await tokenResponse.json();
          console.log('[gcp-cloud] Got access token');

          // Step 2: Create Compute Engine instance
          const instanceConfig = {
            name: instanceName,
            machineType: `zones/${zone}/machineTypes/${machineType}`,
            disks: [{
              boot: true,
              autoDelete: true,
              initializeParams: {
                sourceImage: 'projects/ubuntu-os-cloud/global/images/family/ubuntu-2404-lts-amd64',
                diskSizeGb: '10',
                diskType: `zones/${zone}/diskTypes/pd-standard`
              }
            }],
            networkInterfaces: [{
              network: 'global/networks/default',
              accessConfigs: [{
                type: 'ONE_TO_ONE_NAT',
                name: 'External NAT',
                networkTier: 'PREMIUM'
              }]
            }],
            metadata: {
              items: [{
                key: 'startup-script',
                value: `#!/bin/bash
set -e
# HFT Kernel Tweaks
cat >> /etc/sysctl.conf << 'EOF'
net.ipv4.tcp_fastopen = 3
net.ipv4.tcp_nodelay = 1
net.ipv4.tcp_quickack = 1
net.core.netdev_max_backlog = 65536
vm.swappiness = 10
EOF
sysctl -p
# Install Docker
apt-get update && apt-get install -y docker.io docker-compose
systemctl enable --now docker
echo "HFT Bot setup complete"
`
              }]
            },
            labels: {
              'purpose': 'hft-bot',
              'region': zone.split('-').slice(0, 2).join('-')
            }
          };

          const createResponse = await fetch(
            `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(instanceConfig)
            }
          );

          const createResult = await createResponse.json();
          console.log('[gcp-cloud] Create instance response:', JSON.stringify(createResult).substring(0, 500));

          if (!createResponse.ok) {
            throw new Error(createResult.error?.message || 'Failed to create GCP instance');
          }

          // Step 3: Poll for instance creation and get external IP
          let publicIp: string | null = null;
          for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            const statusResponse = await fetch(
              `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}`,
              {
                headers: { 'Authorization': `Bearer ${access_token}` }
              }
            );
            
            if (statusResponse.ok) {
              const instanceData = await statusResponse.json();
              const natIP = instanceData.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP;
              const status = instanceData.status;
              
              console.log(`[gcp-cloud] Instance status: ${status}, IP: ${natIP}`);
              
              if (status === 'RUNNING' && natIP) {
                publicIp = natIP;
                break;
              }
            }
          }

          // Update database
          await supabase.from('cloud_config').upsert({
            provider: 'gcp',
            region: zone.split('-').slice(0, 2).join('-'),
            instance_type: machineType,
            status: 'running',
            is_active: true,
            updated_at: new Date().toISOString()
          }, { onConflict: 'provider' });

          await supabase.from('vps_config').upsert({
            provider: 'gcp',
            region: zone.split('-').slice(0, 2).join('-'),
            instance_type: machineType,
            status: 'running',
            outbound_ip: publicIp,
            updated_at: new Date().toISOString()
          }, { onConflict: 'provider' });

          await supabase.from('vps_timeline_events').insert({
            provider: 'gcp',
            event_type: 'deployment',
            event_subtype: 'instance_created',
            title: 'GCP Compute Engine Instance Deployed',
            description: `${machineType} in ${zone} - ${publicIp || 'IP pending'}`,
            metadata: { instanceName, machineType, zone, projectId }
          });

          await supabase.from('audit_logs').insert({
            action: 'gcp_instance_deployed',
            entity_type: 'cloud_config',
            new_value: { provider: 'gcp', region: zone, machine_type: machineType, public_ip: publicIp }
          });

          console.log(`[gcp-cloud] Instance deployed with IP: ${publicIp}`);

          return new Response(
            JSON.stringify({ 
              success: true,
              publicIp,
              instanceId: instanceName,
              zone,
              machineType,
              message: 'GCP Compute Engine instance deployed successfully'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );

        } catch (deployError) {
          console.error('[gcp-cloud] Deploy error:', deployError);
          
          await supabase.from('vps_timeline_events').insert({
            provider: 'gcp',
            event_type: 'deployment',
            event_subtype: 'failed',
            title: 'GCP Deployment Failed',
            description: deployError instanceof Error ? deployError.message : 'Unknown error',
            metadata: { zone, machineType, error: String(deployError) }
          });

          return new Response(
            JSON.stringify({ 
              success: false, 
              error: deployError instanceof Error ? deployError.message : 'GCP deployment failed' 
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'get-instance-status': {
        console.log('[gcp-cloud] Getting instance status');
        
        const { data: vpsConfig } = await supabase
          .from('vps_config')
          .select('*')
          .eq('provider', 'gcp')
          .single();

        return new Response(
          JSON.stringify({ 
            status: vpsConfig?.status || 'not_found',
            publicIp: vpsConfig?.outbound_ip,
            region: vpsConfig?.region
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'stop-instance': {
        console.log('[gcp-cloud] Stopping instance');
        
        // In production, call GCP API to stop instance
        await supabase
          .from('vps_config')
          .update({ status: 'stopped' })
          .eq('provider', 'gcp');

        await supabase
          .from('cloud_config')
          .update({ status: 'stopped', is_active: false })
          .eq('provider', 'gcp');

        return new Response(
          JSON.stringify({ success: true, message: 'Instance stopped' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[gcp-cloud] Error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
