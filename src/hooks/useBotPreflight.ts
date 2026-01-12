import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PreflightCheck {
  name: string;
  status: 'pending' | 'pass' | 'fail' | 'warn';
  message: string;
  critical: boolean;
}

export interface PreflightResult {
  canStart: boolean;
  checks: PreflightCheck[];
  exchangeCount: number;
  signalCount: number;
  vpsReady: boolean;
  topSignal?: {
    symbol: string;
    confidence: number;
    recommended_side: string;
  } | null;
  reasons: string[];
}

export function useBotPreflight() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<PreflightResult | null>(null);

  const runPreflight = useCallback(async (): Promise<PreflightResult> => {
    setIsRunning(true);
    const checks: PreflightCheck[] = [];

    try {
      // Call the comprehensive trade-preflight edge function
      console.log('[Preflight] Calling trade-preflight edge function...');
      const { data: preflight, error: preflightError } = await supabase.functions.invoke('trade-preflight');

      if (preflightError) {
        console.error('[Preflight] Edge function error:', preflightError);
        checks.push({
          name: 'System Check',
          status: 'fail',
          message: `Preflight check failed: ${preflightError.message}`,
          critical: true
        });

        const errorResult: PreflightResult = {
          canStart: false,
          checks,
          exchangeCount: 0,
          signalCount: 0,
          vpsReady: false,
          reasons: [preflightError.message]
        };
        setResult(errorResult);
        return errorResult;
      }

      // Parse preflight response
      console.log('[Preflight] Response:', JSON.stringify(preflight));

      // VPS Check
      if (preflight.vps?.reachable && preflight.vps?.ipAddress) {
        checks.push({
          name: 'VPS Deployment',
          status: 'pass',
          message: `VPS ready at ${preflight.vps.ipAddress}${preflight.vps.dockerRunning ? ' (Docker running)' : ''}`,
          critical: true
        });
      } else if (preflight.vps?.ipAddress) {
        checks.push({
          name: 'VPS Deployment',
          status: 'fail',
          message: preflight.vps.error || `VPS at ${preflight.vps.ipAddress} is not responding`,
          critical: true
        });
      } else {
        checks.push({
          name: 'VPS Deployment',
          status: 'fail',
          message: 'No active VPS deployment found. Deploy a VPS first.',
          critical: true
        });
      }

      // Exchange Connections Check
      const exchanges = preflight.exchanges || [];
      const workingExchanges = exchanges.filter((e: any) => e.hasCredentials && (!e.error || e.error.includes('timeout')));
      
      if (workingExchanges.length === 0) {
        checks.push({
          name: 'Exchange Connections',
          status: 'fail',
          message: exchanges.length > 0 
            ? `${exchanges.length} exchange(s) found but none are ready: ${exchanges.map((e: any) => e.error || 'unknown').join(', ')}`
            : 'No exchanges connected. Add exchange API keys first.',
          critical: true
        });
      } else {
        const names = workingExchanges.map((e: any) => {
          const balanceStr = e.balanceUSDT !== null ? ` ($${e.balanceUSDT.toFixed(0)})` : '';
          return `${e.name}${balanceStr}`;
        }).join(', ');
        checks.push({
          name: 'Exchange Connections',
          status: 'pass',
          message: `${workingExchanges.length} exchange(s) ready: ${names}`,
          critical: true
        });
      }

      // Check for exchange errors that need attention
      const exchangeErrors = exchanges.filter((e: any) => e.error && !e.error.includes('timeout'));
      if (exchangeErrors.length > 0) {
        for (const ex of exchangeErrors) {
          if (ex.error.includes('IP') || ex.error.includes('whitelist')) {
            checks.push({
              name: `${ex.name} IP Whitelist`,
              status: 'warn',
              message: `Add VPS IP to ${ex.name} API whitelist`,
              critical: false
            });
          }
        }
      }

      // AI Signals Check (from ai_market_updates - what the bot actually reads)
      const aiSignals = preflight.ai || {};
      if (aiSignals.hasTradableSignal && aiSignals.signalCount > 0) {
        const topSignal = aiSignals.topSignal;
        checks.push({
          name: 'AI Trading Signals',
          status: 'pass',
          message: `${aiSignals.signalCount} signal(s) ready | Top: ${topSignal?.symbol} ${topSignal?.recommended_side?.toUpperCase()} (${topSignal?.confidence}%)`,
          critical: false
        });
      } else {
        checks.push({
          name: 'AI Trading Signals',
          status: 'warn',
          message: 'No recent AI signals. Bot will wait for signals after start.',
          critical: false
        });
      }

      // Kill Switch Check
      if (preflight.risk?.killSwitch) {
        checks.push({
          name: 'Kill Switch',
          status: 'warn',
          message: 'Kill switch is enabled. It will be disabled on start.',
          critical: false
        });
      } else {
        checks.push({
          name: 'Kill Switch',
          status: 'pass',
          message: 'Kill switch is off',
          critical: false
        });
      }

      // SSH Key check (quick local check)
      const { data: sshKey } = await supabase
        .from('hft_ssh_keys')
        .select('id')
        .limit(1)
        .single();

      if (!sshKey) {
        checks.push({
          name: 'SSH Access',
          status: 'warn',
          message: 'No SSH key found. Control may fail.',
          critical: false
        });
      } else {
        checks.push({
          name: 'SSH Access',
          status: 'pass',
          message: 'SSH key available for VPS control',
          critical: false
        });
      }

      // Calculate overall result
      const criticalFails = checks.filter(c => c.critical && c.status === 'fail');
      const canStart = criticalFails.length === 0;

      const preflightResult: PreflightResult = {
        canStart,
        checks,
        exchangeCount: workingExchanges.length,
        signalCount: aiSignals.signalCount || 0,
        vpsReady: preflight.vps?.reachable === true,
        topSignal: aiSignals.topSignal || null,
        reasons: preflight.reasons || []
      };

      setResult(preflightResult);
      return preflightResult;

    } catch (error) {
      console.error('[Preflight] Error:', error);
      checks.push({
        name: 'System Error',
        status: 'fail',
        message: error instanceof Error ? error.message : 'Unknown error',
        critical: true
      });

      const errorResult: PreflightResult = {
        canStart: false,
        checks,
        exchangeCount: 0,
        signalCount: 0,
        vpsReady: false,
        reasons: [error instanceof Error ? error.message : 'Unknown error']
      };

      setResult(errorResult);
      return errorResult;

    } finally {
      setIsRunning(false);
    }
  }, []);

  const sendTestSignal = useCallback(async (): Promise<{ success: boolean; signalId?: string; error?: string }> => {
    try {
      // Send a test signal via bot-signal-receiver which writes to BOTH bot_signals AND ai_market_updates
      const { data, error } = await supabase.functions.invoke('bot-signal-receiver', {
        body: {
          bot_name: 'test',
          symbol: 'BTCUSDT',
          side: 'long',
          confidence: 85,
          exchange_name: 'binance',
          timeframe_minutes: 5,
          current_price: 0 // Will be fetched by bot
        }
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, signalId: data?.signal_id };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }, []);

  // Trigger AI scan to generate fresh signals
  const triggerAIScan = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.functions.invoke('ai-analyze', {
        body: { action: 'scan', symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] }
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }, []);

  return {
    runPreflight,
    sendTestSignal,
    triggerAIScan,
    isRunning,
    result,
    clearResult: () => setResult(null)
  };
}
