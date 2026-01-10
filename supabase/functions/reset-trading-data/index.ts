import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const { confirm } = await req.json();
    
    if (confirm !== 'RESET_ALL_DATA') {
      return new Response(
        JSON.stringify({ success: false, error: 'Confirmation required. Send { confirm: "RESET_ALL_DATA" }' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[RESET] Starting COMPLETE system-wide data reset...');
    const results: Record<string, string> = {};

    // ============================================
    // PHASE 1: TRUNCATE ALL TRADING/HISTORICAL DATA TABLES
    // ============================================
    
    const tablesToTruncate = [
      // Trading data
      'trading_journal',
      'strategy_trades',
      'orders',
      'positions',
      'trade_copies',
      'trade_execution_metrics',
      
      // Historical snapshots
      'balance_history',
      'portfolio_snapshots',
      'backtest_results',
      
      // AI data
      'ai_trade_decisions',
      'ai_provider_performance',
      'ai_market_updates',
      
      // Logs and metrics
      'api_request_logs',
      'audit_logs',
      'alert_history',
      'deployment_logs',
      'failover_events',
      'health_check_results',
      'vps_metrics',
      'vps_proxy_health',
      'exchange_latency_history',
      
      // Cost tracking
      'cost_analysis',
      'cost_optimization_reports',
      'cost_recommendations',
      
      // Other
      'security_scores',
      'trading_sessions',
      'system_notifications',
      'sentiment_data',
      'bot_signals',
      
      // User strategies (clear sample data)
      'trading_strategies',
      'strategy_config',
      'strategy_rules',
    ];

    for (const table of tablesToTruncate) {
      try {
        const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) {
          console.log(`[RESET] Warning: Could not clear ${table}: ${error.message}`);
          results[table] = `warning: ${error.message}`;
        } else {
          console.log(`[RESET] Cleared ${table}`);
          results[table] = 'cleared';
        }
      } catch (e) {
        console.log(`[RESET] Table ${table} may not exist, skipping`);
        results[table] = 'skipped';
      }
    }

    // ============================================
    // PHASE 2: RESET AI PROVIDER USAGE COUNTERS
    // ============================================
    
    const { error: aiError } = await supabase
      .from('ai_providers')
      .update({
        current_usage: 0,
        daily_usage: 0,
        error_count: 0,
        success_count: 0,
        total_latency_ms: 0,
        cooldown_until: null,
        last_error: null,
      })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (aiError) {
      console.log(`[RESET] Warning: ai_providers reset failed: ${aiError.message}`);
      results['ai_providers'] = `warning: ${aiError.message}`;
    } else {
      console.log('[RESET] Reset ai_providers usage counters');
      results['ai_providers'] = 'reset';
    }

    // ============================================
    // PHASE 3: STOP TRADING BOT
    // ============================================
    
    const { error: botError } = await supabase
      .from('trading_config')
      .update({
        bot_status: 'stopped',
        trading_enabled: false,
        trading_mode: 'live',
        updated_at: new Date().toISOString(),
      })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (botError) {
      console.log(`[RESET] Warning: trading_config reset failed: ${botError.message}`);
      results['trading_config'] = `warning: ${botError.message}`;
    } else {
      console.log('[RESET] Stopped trading bot');
      results['trading_config'] = 'reset';
    }

    // ============================================
    // PHASE 4: RESET EXCHANGE BALANCES (keep connections, trigger fresh fetch)
    // ============================================
    
    const { error: exchError } = await supabase
      .from('exchange_connections')
      .update({
        balance_usdt: null,
        balance_updated_at: null,
        last_ping_ms: null,
        last_ping_at: null,
        last_error: null,
        last_error_at: null,
      })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (exchError) {
      console.log(`[RESET] Warning: exchange_connections balance reset failed: ${exchError.message}`);
      results['exchange_connections'] = `warning: ${exchError.message}`;
    } else {
      console.log('[RESET] Reset exchange balances (connections preserved, will fetch fresh)');
      results['exchange_connections'] = 'balances_reset';
    }

    // ============================================
    // PHASE 5: RESET VPS BOT STATUS (keep instances)
    // ============================================
    
    const { error: vpsError } = await supabase
      .from('vps_instances')
      .update({
        bot_status: 'stopped',
      })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (vpsError) {
      console.log(`[RESET] Warning: vps_instances bot status reset failed: ${vpsError.message}`);
      results['vps_instances'] = `warning: ${vpsError.message}`;
    } else {
      console.log('[RESET] Reset VPS bot status (instances preserved)');
      results['vps_instances'] = 'bot_status_reset';
    }

    // Reset hft_deployments bot status
    const { error: hftError } = await supabase
      .from('hft_deployments')
      .update({
        bot_status: 'stopped',
      })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (hftError) {
      console.log(`[RESET] Warning: hft_deployments bot status reset failed: ${hftError.message}`);
      results['hft_deployments'] = `warning: ${hftError.message}`;
    } else {
      console.log('[RESET] Reset HFT deployments bot status');
      results['hft_deployments'] = 'bot_status_reset';
    }

    // ============================================
    // PHASE 6: CLEAR EXCHANGE PULSE (will be repopulated with real data)
    // ============================================
    
    const { error: pulseError } = await supabase
      .from('exchange_pulse')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (pulseError) {
      console.log(`[RESET] Warning: exchange_pulse clear failed: ${pulseError.message}`);
      results['exchange_pulse'] = `warning: ${pulseError.message}`;
    } else {
      console.log('[RESET] Cleared exchange_pulse (will be repopulated with real data)');
      results['exchange_pulse'] = 'cleared';
    }

    // ============================================
    // SUMMARY
    // ============================================
    
    const clearedCount = Object.values(results).filter(v => v === 'cleared').length;
    const resetCount = Object.values(results).filter(v => v === 'reset' || v.includes('reset')).length;
    const warnings = Object.entries(results).filter(([_, v]) => v.includes('warning'));

    console.log(`[RESET] Complete: ${clearedCount} tables cleared, ${resetCount} tables reset, ${warnings.length} warnings`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'System-wide data reset complete. Fresh start with only real exchange data.',
        summary: {
          tables_cleared: clearedCount,
          tables_reset: resetCount,
          warnings: warnings.length,
        },
        details: results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[RESET] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
