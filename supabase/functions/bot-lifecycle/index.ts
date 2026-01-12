import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, deploymentId: providedDeploymentId } = await req.json();

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Missing action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Support both deploymentId provided OR auto-discovery
    let deployment;
    if (providedDeploymentId) {
      const { data, error: deployError } = await supabase
        .from('hft_deployments')
        .select('*')
        .eq('id', providedDeploymentId)
        .single();

      if (deployError || !data) {
        return new Response(
          JSON.stringify({ error: 'Deployment not found', details: deployError }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      deployment = data;
    } else {
      // Auto-discovery: find latest active/running deployment
      const { data: deployments, error: deployError } = await supabase
        .from('hft_deployments')
        .select('*')
        .in('status', ['active', 'running'])
        .order('updated_at', { ascending: false })
        .limit(1);

      if (deployError || !deployments || deployments.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No active deployment found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      deployment = deployments[0];
    }

    if (!deployment.ip_address) {
      return new Response(
        JSON.stringify({ error: 'Deployment has no IP address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
    const result: any = {
      success: false,
      message: '',
      botStatus: deployment.status || 'unknown',
      deploymentId: deployment.id
    };

    // Build environment object with credentials
    let envObj: Record<string, string> = {
      'STRATEGY_ENABLED': 'true',
      'TRADE_MODE': 'LIVE',
      'SUPABASE_URL': supabaseUrl,
      'SUPABASE_SERVICE_ROLE_KEY': supabaseKey
    };

    // Fetch exchange credentials
    const { data: exchanges, error: exchangeError } = await supabase
      .from('exchange_connections')
      .select('exchange_name, api_key, api_secret, api_passphrase')
      .eq('is_connected', true);

    if (exchangeError) {
      console.error('[bot-lifecycle] Error fetching exchanges:', exchangeError);
    } else if (exchanges && exchanges.length > 0) {
      for (const ex of exchanges) {
        const name = ex.exchange_name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        if (ex.api_key) envObj[`${name}_API_KEY`] = ex.api_key;
        if (ex.api_secret) envObj[`${name}_API_SECRET`] = ex.api_secret;
        if (ex.api_passphrase) envObj[`${name}_PASSPHRASE`] = ex.api_passphrase;
      }
      console.log(`[bot-lifecycle] Prepared credentials for ${exchanges.length} exchange(s)`);
    } else {
      console.warn('[bot-lifecycle] No connected exchanges found');
    }

    // Handle restart action
    if (action === 'restart') {
      const stopResp = await fetch(`http://${deployment.ip_address}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'stop', 
          createSignal: false,
          env: envObj
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (!stopResp.ok) {
        result.message = 'Failed to stop bot during restart';
        result.botStatus = 'error';
        return new Response(JSON.stringify(result), { headers });
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Call VPS /control endpoint
    try {
      const controlResp = await fetch(`http://${deployment.ip_address}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: action === 'restart' ? 'start' : action, 
          createSignal: action === 'start' || action === 'restart',
          env: envObj
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (!controlResp.ok) {
        const errorText = await controlResp.text();
        result.message = `VPS /control failed: ${controlResp.status} - ${errorText}`;
        result.botStatus = 'error';
        return new Response(JSON.stringify(result), { headers });
      }

      const controlData = await controlResp.json();
      console.log('[bot-lifecycle] VPS /control response:', controlData);

      // Verify signal file was created (for start/restart actions)
      if (action === 'start' || action === 'restart') {
        try {
          const signalCheckResp = await fetch(`http://${deployment.ip_address}/signal-check`, {
            signal: AbortSignal.timeout(5000)
          });

          if (signalCheckResp.ok) {
            const signalData = await signalCheckResp.json();
            if (!signalData.signalExists) {
              result.message = 'VPS failed to create START_SIGNAL file';
              result.botStatus = 'error';
              return new Response(JSON.stringify(result), { headers });
            }
            console.log('[bot-lifecycle] Signal file verified:', signalData);
          } else {
            console.warn('[bot-lifecycle] Signal check endpoint not available, skipping verification');
          }
        } catch (signalError) {
          console.warn('[bot-lifecycle] Signal verification failed (non-critical):', signalError);
        }
      }

      // Update database status
      const newStatus = action === 'start' || action === 'restart' ? 'running' : action === 'stop' ? 'stopped' : deployment.status;
      const now = new Date().toISOString();
      
      // Update hft_deployments with correct column name
      const { error: updateError } = await supabase
        .from('hft_deployments')
        .update({ 
          status: newStatus,
          updated_at: now
        })
        .eq('id', deployment.id);

      if (updateError) {
        console.error('[bot-lifecycle] Database update error:', updateError);
      }

      // Also update trading_config for dashboard state
      const { error: configError } = await supabase
        .from('trading_config')
        .update({ 
          bot_status: newStatus,
          trading_enabled: action === 'start' || action === 'restart',
          updated_at: now
        })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (configError) {
        console.error('[bot-lifecycle] Trading config update error:', configError);
      }

      result.success = controlData.success || controlData.signalCreated || false;
      result.message = controlData.message || `Bot ${action} command sent successfully`;
      result.botStatus = newStatus;
      result.vpsResponse = controlData;

    } catch (fetchError: any) {
      console.error('[bot-lifecycle] VPS fetch error:', fetchError);
      result.message = `Failed to communicate with VPS: ${fetchError.message}`;
      result.botStatus = 'error';
      return new Response(JSON.stringify(result), { headers });
    }

    return new Response(JSON.stringify(result), { headers });

  } catch (error: any) {
    console.error('[bot-lifecycle] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
