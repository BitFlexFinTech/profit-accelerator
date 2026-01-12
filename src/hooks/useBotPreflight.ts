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
}

export function useBotPreflight() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<PreflightResult | null>(null);

  const runPreflight = useCallback(async (): Promise<PreflightResult> => {
    setIsRunning(true);
    const checks: PreflightCheck[] = [];

    try {
      // Check 1: VPS Deployment exists
      const { data: deployment, error: deploymentError } = await supabase
        .from('hft_deployments')
        .select('id, server_id, ip_address, status, bot_status')
        .in('status', ['active', 'running'])
        .limit(1)
        .single();

      if (deploymentError || !deployment) {
        checks.push({
          name: 'VPS Deployment',
          status: 'fail',
          message: 'No active VPS deployment found. Deploy a VPS first.',
          critical: true
        });
      } else if (!deployment.ip_address) {
        checks.push({
          name: 'VPS Deployment',
          status: 'fail',
          message: 'VPS has no IP address assigned.',
          critical: true
        });
      } else {
        checks.push({
          name: 'VPS Deployment',
          status: 'pass',
          message: `VPS ready at ${deployment.ip_address}`,
          critical: true
        });
      }

      // Check 2: Exchange Connections
      const { data: exchanges, error: exchangeError } = await supabase
        .from('exchange_connections')
        .select('exchange_name, is_connected, api_key, api_secret')
        .eq('is_connected', true);

      const connectedExchanges = exchanges?.filter(e => e.api_key && e.api_secret) || [];
      
      if (exchangeError || connectedExchanges.length === 0) {
        checks.push({
          name: 'Exchange Connections',
          status: 'fail',
          message: 'No exchanges connected. Add exchange API keys first.',
          critical: true
        });
      } else {
        const names = connectedExchanges.map(e => e.exchange_name).join(', ');
        checks.push({
          name: 'Exchange Connections',
          status: 'pass',
          message: `${connectedExchanges.length} exchange(s) ready: ${names}`,
          critical: true
        });
      }

      // Check 3: Kill switch
      const { data: config } = await supabase
        .from('trading_config')
        .select('global_kill_switch_enabled')
        .limit(1)
        .single();

      if (config?.global_kill_switch_enabled) {
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

      // Check 4: Recent signals (informational)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentSignals, count: signalCount } = await supabase
        .from('bot_signals')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', fiveMinutesAgo);

      const totalSignals = signalCount || 0;

      if (totalSignals === 0) {
        checks.push({
          name: 'Trade Signals',
          status: 'warn',
          message: 'No signals in last 5 min. Bot will wait for signals after start.',
          critical: false
        });
      } else {
        checks.push({
          name: 'Trade Signals',
          status: 'pass',
          message: `${totalSignals} signal(s) received in last 5 minutes`,
          critical: false
        });
      }

      // Check 5: SSH Key availability (for control)
      const { data: sshKey } = await supabase
        .from('hft_ssh_keys')
        .select('id')
        .limit(1)
        .single();

      const vultrKey = await supabase.functions.invoke('manage-secrets', {
        body: { action: 'check', secretName: 'VULTR_SSH_PRIVATE_KEY' }
      }).then(r => r.data?.exists).catch(() => false);

      if (!sshKey && !vultrKey) {
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
        exchangeCount: connectedExchanges.length,
        signalCount: totalSignals,
        vpsReady: !!deployment?.ip_address
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
        vpsReady: false
      };

      setResult(errorResult);
      return errorResult;

    } finally {
      setIsRunning(false);
    }
  }, []);

  const sendTestSignal = useCallback(async (): Promise<{ success: boolean; signalId?: string; error?: string }> => {
    try {
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

  return {
    runPreflight,
    sendTestSignal,
    isRunning,
    result,
    clearResult: () => setResult(null)
  };
}
