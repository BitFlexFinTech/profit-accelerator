import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VULTR_API_BASE = 'https://api.vultr.com/v2';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, apiKey, sshPublicKey, specs } = await req.json();

    switch (action) {
      case 'validate-api-key': {
        const response = await fetch(`${VULTR_API_BASE}/account`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          return new Response(
            JSON.stringify({ valid: true, balance: data.account?.balance }),
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
        const sshKeyResponse = await fetch(`${VULTR_API_BASE}/ssh-keys`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'tokyo-hft-bot',
            ssh_key: sshPublicKey,
          }),
        });

        let sshKeyId = '';
        if (sshKeyResponse.ok) {
          const sshData = await sshKeyResponse.json();
          sshKeyId = sshData.ssh_key?.id;
        }

        // Step 2: Create instance
        const instanceResponse = await fetch(`${VULTR_API_BASE}/instances`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            region: specs?.region || 'nrt', // Tokyo
            plan: specs?.plan || 'vhf-1c-1gb', // High Frequency
            os_id: 2136, // Ubuntu 24.04 LTS
            label: 'tokyo-hft-bot',
            sshkey_id: sshKeyId ? [sshKeyId] : undefined,
            backups: 'disabled',
            ddos_protection: false,
            activation_email: false,
          }),
        });

        if (!instanceResponse.ok) {
          const error = await instanceResponse.text();
          console.error('Vultr instance creation failed:', error);
          return new Response(
            JSON.stringify({ error: 'Failed to create instance', details: error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const instanceData = await instanceResponse.json();
        const instanceId = instanceData.instance?.id;

        // Step 3: Poll for running status and IP
        let publicIp = '';
        let attempts = 0;
        const maxAttempts = 30;

        while (attempts < maxAttempts && !publicIp) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s
          
          const statusResponse = await fetch(`${VULTR_API_BASE}/instances/${instanceId}`, {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
            },
          });

          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.instance?.status === 'active' && statusData.instance?.main_ip !== '0.0.0.0') {
              publicIp = statusData.instance.main_ip;
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
        
        const response = await fetch(`${VULTR_API_BASE}/instances/${instanceId}`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          return new Response(
            JSON.stringify({ 
              status: data.instance?.status,
              publicIp: data.instance?.main_ip,
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
        
        const response = await fetch(`${VULTR_API_BASE}/instances/${instanceId}/halt`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        return new Response(
          JSON.stringify({ success: response.ok }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'start-instance': {
        const { instanceId } = await req.json();
        
        const response = await fetch(`${VULTR_API_BASE}/instances/${instanceId}/start`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        return new Response(
          JSON.stringify({ success: response.ok }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'destroy-instance': {
        const { instanceId } = await req.json();
        
        const response = await fetch(`${VULTR_API_BASE}/instances/${instanceId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
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
    console.error('Vultr cloud function error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});