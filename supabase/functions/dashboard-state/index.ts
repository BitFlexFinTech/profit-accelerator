import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to safely fetch with timeout and retry
async function safeFetch(url: string, options: RequestInit, timeoutMs = 5000, retries = 1): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      if (attempt === retries) {
        console.error(`[dashboard-state] Fetch failed after ${retries + 1} attempts:`, error.message);
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

    // Fetch deployment info
    const { data: deployments, error: deployError } = await supabase
      .from('hft_deployments')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (deployError) {
      console.error('[dashboard-state] Deployment fetch error:', deployError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch deployment',
          details: deployError.message 
        }),
        { status: 500, headers }
      );
    }

    const deployment = deployments?.[0];
    
    if (!deployment) {
      return new Response(
        JSON.stringify({ 
          deployments: [],
          vpsStatus: null,
          error: 'No deployment found'
        }),
        { status: 200, headers }
      );
    }

    // Fetch VPS status with proper error handling
    let vpsStatus = null;
    if (deployment.ip_address) {
      try {
        const healthResp = await safeFetch(
          `http://${deployment.ip_address}/health`,
          { method: 'GET' },
          5000,
          1
        );

        if (healthResp && healthResp.ok) {
          vpsStatus = await healthResp.json();
        } else {
          console.warn('[dashboard-state] VPS health check failed or timed out');
          vpsStatus = {
            error: 'VPS unreachable or timeout',
            reachable: false
          };
        }
      } catch (error: any) {
        console.error('[dashboard-state] VPS fetch exception:', error);
        vpsStatus = {
          error: error.message || 'Network connection lost',
          reachable: false
        };
      }
    }

    // Fetch trading config
    const { data: tradingConfig, error: configError } = await supabase
      .from('trading_config')
      .select('*')
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .single();

    if (configError) {
      console.warn('[dashboard-state] Trading config fetch error:', configError);
    }

    // Fetch recent trades
    const { data: recentTrades, error: tradesError } = await supabase
      .from('trading_journal')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (tradesError) {
      console.warn('[dashboard-state] Trades fetch error:', tradesError);
    }

    // Fetch recent signals
    const { data: recentSignals, error: signalsError } = await supabase
      .from('ai_market_updates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (signalsError) {
      console.warn('[dashboard-state] Signals fetch error:', signalsError);
    }

    // Fetch connected exchanges
    const { data: exchanges } = await supabase
      .from('exchange_connections')
      .select('exchange_name, is_connected, balance_usdt, last_ping_ms')
      .eq('is_connected', true);

    // Fetch total balance
    const { data: latestBalance } = await supabase
      .from('balance_history')
      .select('total_balance')
      .order('snapshot_time', { ascending: false })
      .limit(1)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        deployment: deployment,
        vpsStatus: vpsStatus,
        bot: {
          status: tradingConfig?.bot_status || 'stopped',
          tradingEnabled: tradingConfig?.trading_enabled || false,
          tradingMode: tradingConfig?.trading_mode || 'spot',
          testMode: tradingConfig?.test_mode || false,
          killSwitch: tradingConfig?.global_kill_switch_enabled || false,
          maxPositionSize: tradingConfig?.max_position_size || 350
        },
        vps: deployment ? {
          id: deployment.id,
          ip: deployment.ip_address,
          status: deployment.status,
          botStatus: deployment.bot_status,
          provider: deployment.provider,
          region: deployment.region
        } : null,
        exchanges: (exchanges || []).map(e => ({
          name: e.exchange_name,
          connected: e.is_connected,
          balance: e.balance_usdt,
          latencyMs: e.last_ping_ms
        })),
        tradingConfig: tradingConfig || null,
        recentTrades: recentTrades || [],
        recentSignals: recentSignals || [],
        portfolio: {
          totalBalance: latestBalance?.total_balance || 0
        },
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers }
    );

  } catch (error: any) {
    console.error('[dashboard-state] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        type: 'RUNTIME_ERROR',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
