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
    const body = await req.json();
    const { action, sshPublicKey, specs, instanceId, ipAddress } = body;
    
    // Use provided API key or fall back to stored secret
    const apiKey = body.apiKey || Deno.env.get('VULTR_API_KEY');
    
    if (!apiKey) {
      console.error('No API key provided or found in secrets');
      return new Response(
        JSON.stringify({ error: 'API key required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Vultr action: ${action}`);

    switch (action) {
      case 'validate-api-key': {
        console.log('Validating API key...');
        const response = await fetch(`${VULTR_API_BASE}/account`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log('API key valid, balance:', data.account?.balance);
          return new Response(
            JSON.stringify({ valid: true, balance: data.account?.balance }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          console.log('API key invalid, status:', response.status);
          return new Response(
            JSON.stringify({ valid: false }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'get-instance-by-ip': {
        console.log('Looking up instance by IP:', ipAddress);
        
        const response = await fetch(`${VULTR_API_BASE}/instances`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          console.error('Failed to fetch instances:', response.status);
          return new Response(
            JSON.stringify({ error: 'Failed to fetch instances', found: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await response.json();
        const instances = data.instances || [];
        
        console.log(`Found ${instances.length} instances, searching for IP ${ipAddress}`);
        
        const matchingInstance = instances.find((inst: any) => 
          inst.main_ip === ipAddress || inst.v6_main_ip === ipAddress
        );

        if (matchingInstance) {
          console.log('Found matching instance:', matchingInstance.id);
          return new Response(
            JSON.stringify({ 
              found: true,
              instanceId: matchingInstance.id,
              status: matchingInstance.status,
              region: matchingInstance.region,
              plan: matchingInstance.plan,
              label: matchingInstance.label,
              publicIp: matchingInstance.main_ip,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          console.log('No instance found with IP:', ipAddress);
          return new Response(
            JSON.stringify({ found: false, message: 'No instance found with that IP' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'deploy-instance': {
        console.log('Deploying new instance...');
        
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
          console.log('SSH key created:', sshKeyId);
        } else {
          console.log('SSH key creation failed, continuing without:', sshKeyResponse.status);
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
        const newInstanceId = instanceData.instance?.id;
        console.log('Instance created:', newInstanceId);

        // Step 3: Poll for running status and IP
        let publicIp = '';
        let attempts = 0;
        const maxAttempts = 30;

        while (attempts < maxAttempts && !publicIp) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s
          
          const statusResponse = await fetch(`${VULTR_API_BASE}/instances/${newInstanceId}`, {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
            },
          });

          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.instance?.status === 'active' && statusData.instance?.main_ip !== '0.0.0.0') {
              publicIp = statusData.instance.main_ip;
              console.log('Instance active with IP:', publicIp);
            }
          }
          attempts++;
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            instanceId: newInstanceId, 
            publicIp: publicIp || 'Pending...',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-instance-status': {
        console.log('Getting instance status:', instanceId);
        
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
        console.log('Stopping instance:', instanceId);
        
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
        console.log('Starting instance:', instanceId);
        
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
        console.log('Destroying instance:', instanceId);
        
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
        console.error('Unknown action:', action);
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
