import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLOUDWAYS_API = 'https://api.cloudways.com/api/v1';

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
    console.log(`[cloudways-cloud] Action: ${action}`);

    switch (action) {
      case 'validate-credentials': {
        const { email, apiKey } = params;

        // Get OAuth token
        const tokenResponse = await fetch(`${CLOUDWAYS_API}/oauth/access_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `email=${encodeURIComponent(email)}&api_key=${encodeURIComponent(apiKey)}`,
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.access_token) {
          return new Response(
            JSON.stringify({ success: true, valid: true, token: tokenData.access_token }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: false, valid: false, error: 'Invalid credentials' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'list-servers': {
        const { accessToken } = params;

        const response = await fetch(`${CLOUDWAYS_API}/server`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const data = await response.json();
        
        // Filter for Tokyo/Singapore servers
        const servers = data.servers?.filter((s: any) => 
          s.region?.includes('tokyo') || s.region?.includes('singapore') || s.region?.includes('asia')
        ) || [];

        return new Response(
          JSON.stringify({ success: true, servers }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-server-ip': {
        const { accessToken, serverId } = params;

        const response = await fetch(`${CLOUDWAYS_API}/server/${serverId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const data = await response.json();

        return new Response(
          JSON.stringify({ 
            success: true, 
            publicIp: data.server?.public_ip,
            status: data.server?.status,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'create-app': {
        const { accessToken, serverId, appLabel } = params;

        const response = await fetch(`${CLOUDWAYS_API}/app`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            server_id: serverId,
            application: 'custom',
            app_label: appLabel || 'hft-bot',
          }),
        });

        const data = await response.json();

        return new Response(
          JSON.stringify({ success: true, app: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'run-script': {
        const { accessToken, serverId, script } = params;

        // Execute HFT bot installation script
        const installScript = script || `
#!/bin/bash
apt-get update && apt-get install -y docker.io docker-compose
mkdir -p /opt/hft-bot
cd /opt/hft-bot
echo "HFT Bot environment installed successfully"
`;

        const response = await fetch(`${CLOUDWAYS_API}/server/manage/operation`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            server_id: serverId,
            operation: 'execute_ssh_script',
            script: installScript,
          }),
        });

        const data = await response.json();

        return new Response(
          JSON.stringify({ success: true, result: data }),
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
    console.error('[cloudways-cloud] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});