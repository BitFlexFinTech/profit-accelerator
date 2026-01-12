import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * TRADE PREFLIGHT CHECK
 * 
 * This function performs comprehensive readiness checks before starting the bot:
 * 1. VPS reachability and health
 * 2. Exchange connections with valid credentials
 * 3. AI signals availability (from ai_market_updates which the bot reads)
 * 4. Kill switch status
 * 5. Balance verification (via VPS proxy)
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('[trade-preflight] Starting comprehensive preflight checks...');

  const result = {
    ok: false,
    timestamp: new Date().toISOString(),
    vps: {
      reachable: false,
      ipAddress: null as string | null,
      dockerRunning: false,
      signalExists: false,
      provider: null as string | null,
      region: null as string | null,
      error: null as string | null,
    },
    exchanges: [] as Array<{
      name: string;
      connected: boolean;
      hasCredentials: boolean;
      balanceUSDT: number | null;
      error: string | null;
    }>,
  ai: {
    hasTradableSignal: false,
    signalCount: 0,
    topSignal: null as any,
    lastSignalAge: null as string | null,
  },
    risk: {
      killSwitch: false,
      tradingEnabled: false,
      maxPositionSize: 0,
    },
    reasons: [] as string[],
  };

  try {
    // ========== CHECK 1: VPS DEPLOYMENT ==========
    console.log('[trade-preflight] Check 1: VPS Deployment...');
    const { data: deployment } = await supabase
      .from('hft_deployments')
      .select('id, server_id, ip_address, status, bot_status, provider, region')
      .in('status', ['active', 'running'])
      .limit(1)
      .single();

    if (!deployment) {
      result.reasons.push('No active VPS deployment found');
    } else if (!deployment.ip_address) {
      result.reasons.push('VPS has no IP address assigned');
    } else {
      result.vps.ipAddress = deployment.ip_address;
      result.vps.provider = deployment.provider;
      result.vps.region = deployment.region;

      // Try to reach VPS health endpoint
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        
        const healthResp = await fetch(`http://${deployment.ip_address}/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (healthResp.ok) {
          const health = await healthResp.json();
          result.vps.reachable = true;
          result.vps.dockerRunning = health.ok === true || health.status === 'ok';
          console.log('[trade-preflight] VPS health:', JSON.stringify(health));
        }
      } catch (vpErr) {
        const errMsg = vpErr instanceof Error ? vpErr.message : String(vpErr);
        result.vps.error = `VPS unreachable: ${errMsg}`;
        result.reasons.push(`VPS at ${deployment.ip_address} is not responding`);
      }

      // Check signal-check endpoint
      if (result.vps.reachable) {
        try {
          const signalResp = await fetch(`http://${deployment.ip_address}/signal-check`, {
            signal: AbortSignal.timeout(5000),
          });
          if (signalResp.ok) {
            const signalData = await signalResp.json();
            result.vps.signalExists = signalData.signalExists === true;
            result.vps.dockerRunning = signalData.dockerRunning === true || result.vps.dockerRunning;
          }
        } catch {
          // Non-critical - older VPS versions may not have this endpoint
        }
      }
    }

    // ========== CHECK 2: EXCHANGE CONNECTIONS ==========
    console.log('[trade-preflight] Check 2: Exchange connections...');
    const { data: exchanges } = await supabase
      .from('exchange_connections')
      .select('exchange_name, is_connected, api_key, api_secret, api_passphrase')
      .eq('is_connected', true);

    if (!exchanges || exchanges.length === 0) {
      result.reasons.push('No exchange connections configured');
    } else {
      for (const ex of exchanges) {
        const hasKey = !!ex.api_key && ex.api_key.length > 10;
        const hasSecret = !!ex.api_secret && ex.api_secret.length > 10;
        
        const exResult = {
          name: ex.exchange_name,
          connected: ex.is_connected,
          hasCredentials: hasKey && hasSecret,
          balanceUSDT: null as number | null,
          error: null as string | null,
        };

        if (!exResult.hasCredentials) {
          exResult.error = 'Missing API key or secret';
          result.reasons.push(`${ex.exchange_name}: Missing API credentials`);
        } else if (result.vps.reachable && result.vps.ipAddress) {
          // Try to fetch balance via VPS proxy
          try {
            const balanceResp = await fetch(`http://${result.vps.ipAddress}/balance`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                exchange: ex.exchange_name.toLowerCase(),
                apiKey: ex.api_key,
                apiSecret: ex.api_secret,
                passphrase: ex.api_passphrase || '',
              }),
              signal: AbortSignal.timeout(10000),
            });

            if (balanceResp.ok) {
              const balData = await balanceResp.json();
              if (balData.success) {
                exResult.balanceUSDT = balData.balance || balData.totalUSDT || 0;
                console.log(`[trade-preflight] ${ex.exchange_name} balance: $${exResult.balanceUSDT}`);
                
              if (exResult.balanceUSDT !== null && exResult.balanceUSDT < 10) {
                exResult.error = 'Insufficient balance (< $10)';
                result.reasons.push(`${ex.exchange_name}: Balance too low ($${exResult.balanceUSDT.toFixed(2)})`);
              }
              } else {
                exResult.error = balData.error || 'Balance check failed';
                // Check for IP whitelist error
                if (balData.error?.includes('IP') || balData.error?.includes('whitelist') || balData.error?.includes('-2015')) {
                  result.reasons.push(`${ex.exchange_name}: VPS IP not whitelisted - add ${result.vps.ipAddress} to API whitelist`);
                } else {
                  result.reasons.push(`${ex.exchange_name}: ${balData.error}`);
                }
              }
            }
          } catch (balErr) {
            exResult.error = 'Balance check timeout';
          }
        }

        result.exchanges.push(exResult);
      }
    }

    // ========== CHECK 3: AI SIGNALS (from ai_market_updates - what the bot ACTUALLY reads) ==========
    console.log('[trade-preflight] Check 3: AI signals...');
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
    
    const { data: aiSignals } = await supabase
      .from('ai_market_updates')
      .select('id, symbol, exchange_name, confidence, recommended_side, profit_timeframe_minutes, created_at')
      .gte('confidence', 70)
      .gte('created_at', sixtySecondsAgo)
      .in('profit_timeframe_minutes', [1, 3, 5])
      .order('confidence', { ascending: false })
      .limit(10);

    if (aiSignals && aiSignals.length > 0) {
      result.ai.hasTradableSignal = true;
      result.ai.signalCount = aiSignals.length;
      result.ai.topSignal = aiSignals[0];
      
      // Calculate age of most recent signal
      const mostRecent = new Date(aiSignals[0].created_at);
      const ageMs = Date.now() - mostRecent.getTime();
      result.ai.lastSignalAge = `${Math.round(ageMs / 1000)}s ago`;
      
      console.log(`[trade-preflight] Found ${aiSignals.length} tradable AI signals, top: ${aiSignals[0].symbol} ${aiSignals[0].recommended_side} (${aiSignals[0].confidence}%)`);
    } else {
      // Not a blocking issue - bot will wait for signals
      console.log('[trade-preflight] No recent high-confidence AI signals (bot will wait for signals)');
    }

    // ========== CHECK 4: TRADING CONFIG / KILL SWITCH ==========
    console.log('[trade-preflight] Check 4: Trading config...');
    const { data: config } = await supabase
      .from('trading_config')
      .select('global_kill_switch_enabled, trading_enabled, max_position_size')
      .limit(1)
      .single();

    if (config) {
      result.risk.killSwitch = config.global_kill_switch_enabled === true;
      result.risk.tradingEnabled = config.trading_enabled !== false;
      result.risk.maxPositionSize = config.max_position_size || 500;

      if (result.risk.killSwitch) {
        result.reasons.push('Kill switch is enabled - will be disabled on start');
      }
    }

    // ========== FINAL DECISION ==========
    const hasVps = result.vps.reachable === true && result.vps.ipAddress !== null;
    const hasWorkingExchange = result.exchanges.some(e => 
      e.hasCredentials && (e.balanceUSDT === null || e.balanceUSDT >= 10)
    );
    
    // Bot CAN start even without signals - it will wait for them
    // Critical failures are: no VPS, no exchanges
    result.ok = hasVps && hasWorkingExchange;

    if (!result.ok && result.reasons.length === 0) {
      result.reasons.push('Unknown failure - check logs');
    }

    console.log(`[trade-preflight] Result: ${result.ok ? '✅ READY' : '❌ NOT READY'}`);
    if (!result.ok) {
      console.log('[trade-preflight] Blocking reasons:', result.reasons);
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[trade-preflight] Fatal error:', error);
    result.reasons.push(`System error: ${error instanceof Error ? error.message : String(error)}`);
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
