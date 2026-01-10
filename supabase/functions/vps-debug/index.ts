import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Debug endpoints to remotely inspect VPS bot state
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'state';

    // Get running VPS
    const { data: vps } = await supabase
      .from('vps_instances')
      .select('ip_address, provider, name, status')
      .eq('status', 'running')
      .not('ip_address', 'is', null)
      .single();

    if (!vps?.ip_address) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'No running VPS found',
        available_actions: ['state', 'logs', 'health', 'ping-exchanges']
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[vps-debug] Fetching ${action} from VPS at ${vps.ip_address}...`);

    // Map action to endpoint
    const endpointMap: Record<string, string> = {
      'state': '/state',
      'logs': '/logs',
      'health': '/health',
      'ping-exchanges': '/ping-exchanges'
    };

    const endpoint = endpointMap[action] || '/health';

    try {
      const response = await fetch(`http://${vps.ip_address}${endpoint}`, {
        method: 'GET',
        signal: AbortSignal.timeout(15000)
      });

      const data = await response.json();
      
      return new Response(JSON.stringify({
        success: true,
        vps: {
          ip: vps.ip_address,
          provider: vps.provider,
          name: vps.name,
          status: vps.status
        },
        action,
        data,
        fetched_at: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (fetchError: unknown) {
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error(`[vps-debug] Failed to fetch from VPS:`, fetchError);
      
      return new Response(JSON.stringify({
        success: false,
        error: `Failed to reach VPS: ${errorMessage}`,
        vps: {
          ip: vps.ip_address,
          provider: vps.provider,
          name: vps.name,
          status: vps.status
        },
        troubleshooting: [
          'Check if the bot is running on the VPS',
          'Verify port 80 is open in firewall and Nginx is running',
          'SSH into VPS and check: pm2 status',
          'Reinstall bot: curl -fsSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | sudo bash'
        ]
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (err) {
    console.error('[vps-debug] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: String(err)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
