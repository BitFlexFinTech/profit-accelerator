

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONTABO_API_BASE = 'https://api.contabo.com/v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, instanceId } = body;
    
    const clientId = body.clientId || Deno.env.get('CONTABO_CLIENT_ID');
    const clientSecret = body.clientSecret || Deno.env.get('CONTABO_CLIENT_SECRET');
    const apiUser = body.apiUser || Deno.env.get('CONTABO_API_USER');
    const apiPassword = body.apiPassword || Deno.env.get('CONTABO_API_PASSWORD');
    
    console.log(`Contabo action: ${action}`);

    // Get access token
    async function getAccessToken() {
      const tokenResponse = await fetch('https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId || '',
          client_secret: clientSecret || '',
          username: apiUser || '',
          password: apiPassword || '',
          grant_type: 'password',
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get access token');
      }

      const tokenData = await tokenResponse.json();
      return tokenData.access_token;
    }

    switch (action) {
      case 'validate-credentials': {
        try {
          const token = await getAccessToken();
          return new Response(
            JSON.stringify({ valid: !!token }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch {
          return new Response(
            JSON.stringify({ valid: false }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'list-instances': {
        const token = await getAccessToken();
        const response = await fetch(`${CONTABO_API_BASE}/compute/instances`, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'x-request-id': crypto.randomUUID(),
          },
        });

        if (response.ok) {
          const data = await response.json();
          return new Response(
            JSON.stringify({ instances: data.data || [] }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ error: 'Failed to list instances' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-instance-status': {
        const token = await getAccessToken();
        const response = await fetch(`${CONTABO_API_BASE}/compute/instances/${instanceId}`, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'x-request-id': crypto.randomUUID(),
          },
        });

        if (response.ok) {
          const data = await response.json();
          const instance = data.data?.[0];
          return new Response(
            JSON.stringify({ 
              status: instance?.status,
              publicIp: instance?.ipConfig?.v4?.ip,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ error: 'Failed to get status' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'deploy-instance': {
        const token = await getAccessToken();
        const { region, instanceType, imageId, sshPublicKey } = body;
        
        // Get available images
        const imagesResponse = await fetch(`${CONTABO_API_BASE}/compute/images?standardImage=true`, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'x-request-id': crypto.randomUUID(),
          },
        });
        
        let osImageId = imageId;
        if (!osImageId && imagesResponse.ok) {
          const imagesData = await imagesResponse.json();
          const ubuntu24 = imagesData.data?.find((img: { name: string }) => 
            img.name.toLowerCase().includes('ubuntu') && img.name.includes('24')
          );
          osImageId = ubuntu24?.imageId || 'afecbb85-e2fc-46f0-9684-b46b1faf00bb'; // Default Ubuntu 24.04
        }
        
        // Create instance
        const createResponse = await fetch(`${CONTABO_API_BASE}/compute/instances`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'x-request-id': crypto.randomUUID(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageId: osImageId,
            productId: instanceType || 'V45', // Contabo VPS S SSD (4 vCPU, 8GB RAM)
            region: region || 'EU',
            displayName: `hft-bot-${Date.now()}`,
            sshKeys: sshPublicKey ? [sshPublicKey] : undefined,
          }),
        });
        
        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          throw new Error(`Contabo deployment failed: ${errorText}`);
        }
        
        const instanceData = await createResponse.json();
        const instance = instanceData.data?.[0];
        
        return new Response(
          JSON.stringify({ 
            success: true,
            instanceId: instance?.instanceId?.toString(),
            publicIp: instance?.ipConfig?.v4?.ip || 'Provisioning...',
            status: instance?.status || 'provisioning'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action. Supported: validate-credentials, list-instances, get-instance-status, deploy-instance' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Contabo cloud function error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
