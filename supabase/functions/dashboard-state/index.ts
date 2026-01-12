import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Dashboard State Edge Function
 * 
 * Returns bot/trading state for the dashboard UI
 * Uses service role to read RLS-protected tables
 * This solves the issue where browser cannot read trading_config due to RLS
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Get trading config
    const { data: config } = await supabase
      .from('trading_config')
      .select('bot_status, trading_enabled, trading_mode, test_mode, global_kill_switch_enabled, max_position_size')
      .limit(1)
      .single();

    // Get active VPS deployment
    const { data: deployment } = await supabase
      .from('hft_deployments')
      .select('id, ip_address, bot_status, status, provider, region, server_id')
      .in('status', ['active', 'running'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    // Get connected exchanges
    const { data: exchanges } = await supabase
      .from('exchange_connections')
      .select('exchange_name, is_connected, balance_usdt, last_ping_ms')
      .eq('is_connected', true);

    // Get recent AI signals count
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: signalCount } = await supabase
      .from('ai_market_updates')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', fiveMinAgo)
      .gte('confidence', 70);

    // Get total balance
    const { data: latestBalance } = await supabase
      .from('balance_history')
      .select('total_balance')
      .order('snapshot_time', { ascending: false })
      .limit(1)
      .single();

    const state = {
      success: true,
      bot: {
        status: config?.bot_status || 'stopped',
        tradingEnabled: config?.trading_enabled || false,
        tradingMode: config?.trading_mode || 'spot',
        testMode: config?.test_mode || false,
        killSwitch: config?.global_kill_switch_enabled || false,
        maxPositionSize: config?.max_position_size || 350
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
      signals: {
        recentCount: signalCount || 0
      },
      portfolio: {
        totalBalance: latestBalance?.total_balance || 0
      },
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(state), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[dashboard-state] Error:', message);
    return new Response(
      JSON.stringify({ success: false, error: message }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
