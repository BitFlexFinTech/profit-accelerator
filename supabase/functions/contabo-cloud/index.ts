import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONTABO_API_BASE = 'https://api.contabo.com/v1';

serve(async (req) => {
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

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
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
