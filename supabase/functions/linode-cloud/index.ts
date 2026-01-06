import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LINODE_API_BASE = 'https://api.linode.com/v4';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, token, sshPublicKey, specs } = await req.json();

    switch (action) {
      case 'validate-token': {
        const response = await fetch(`${LINODE_API_BASE}/account`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          return new Response(
            JSON.stringify({ valid: true, email: data.email }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          return new Response(
            JSON.stringify({ valid: false }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'deploy-instance': {
        // Step 1: Add SSH key
        const sshKeyResponse = await fetch(`${LINODE_API_BASE}/profile/sshkeys`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            label: 'tokyo-hft-bot',
            ssh_key: sshPublicKey,
          }),
        });

        // Continue even if SSH key already exists

        // Step 2: Create Linode instance
        const instanceResponse = await fetch(`${LINODE_API_BASE}/linode/instances`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            region: specs?.region || 'ap-northeast', // Tokyo 2
            type: specs?.type || 'g6-nanode-1', // Nanode 1GB
            image: 'linode/ubuntu24.04',
            label: 'tokyo-hft-bot',
            root_pass: crypto.randomUUID() + 'Aa1!', // Random secure password
            authorized_keys: sshPublicKey ? [sshPublicKey] : undefined,
            booted: true,
            backups_enabled: false,
          }),
        });

        if (!instanceResponse.ok) {
          const error = await instanceResponse.text();
          console.error('Linode instance creation failed:', error);
          return new Response(
            JSON.stringify({ error: 'Failed to create instance', details: error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const instanceData = await instanceResponse.json();
        const instanceId = instanceData.id;

        // Step 3: Poll for running status and IP
        let publicIp = '';
        let attempts = 0;
        const maxAttempts = 30;

        while (attempts < maxAttempts && !publicIp) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s
          
          const statusResponse = await fetch(`${LINODE_API_BASE}/linode/instances/${instanceId}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });

          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.status === 'running' && statusData.ipv4?.length > 0) {
              publicIp = statusData.ipv4[0];
            }
          }
          attempts++;
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            instanceId, 
            publicIp: publicIp || 'Pending...',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-instance-status': {
        const { instanceId } = await req.json();
        
        const response = await fetch(`${LINODE_API_BASE}/linode/instances/${instanceId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          return new Response(
            JSON.stringify({ 
              status: data.status,
              publicIp: data.ipv4?.[0],
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ error: 'Failed to get status' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'stop-instance': {
        const { instanceId } = await req.json();
        
        const response = await fetch(`${LINODE_API_BASE}/linode/instances/${instanceId}/shutdown`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        return new Response(
          JSON.stringify({ success: response.ok }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'start-instance': {
        const { instanceId } = await req.json();
        
        const response = await fetch(`${LINODE_API_BASE}/linode/instances/${instanceId}/boot`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        return new Response(
          JSON.stringify({ success: response.ok }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete-instance': {
        const { instanceId } = await req.json();
        
        const response = await fetch(`${LINODE_API_BASE}/linode/instances/${instanceId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        return new Response(
          JSON.stringify({ success: response.ok }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Linode cloud function error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});