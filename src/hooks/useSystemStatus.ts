import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SystemStatus {
  ai: { isActive: boolean; model: string | null };
  exchanges: { connected: number; total: number; balanceUsdt: number };
  vps: { status: string; region: string; ip: string | null; provider: string | null };
  isFullyOperational: boolean;
  isLoading: boolean;
}

export function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus>({
    ai: { isActive: false, model: null },
    exchanges: { connected: 0, total: 11, balanceUsdt: 0 },
    vps: { status: 'inactive', region: 'ap-northeast-1', ip: null, provider: null },
    isFullyOperational: false,
    isLoading: true,
  });

  const fetchStatus = useCallback(async () => {
    try {
      const [aiResult, exchangeResult, vpsResult] = await Promise.all([
        supabase.from('ai_config').select('is_active, model').eq('provider', 'groq').single(),
        supabase.from('exchange_connections').select('is_connected, balance_usdt'),
        supabase.from('vps_config').select('status, region, outbound_ip, provider').single(),
      ]);

      const connectedExchanges = exchangeResult.data?.filter(e => e.is_connected) || [];
      const totalBalance = connectedExchanges.reduce((sum, e) => sum + (Number(e.balance_usdt) || 0), 0);

      setStatus({
        ai: {
          isActive: aiResult.data?.is_active ?? false,
          model: aiResult.data?.model ?? null,
        },
        exchanges: {
          connected: connectedExchanges.length,
          total: 11,
          balanceUsdt: totalBalance,
        },
        vps: {
          status: vpsResult.data?.status ?? 'inactive',
          region: vpsResult.data?.region ?? 'ap-northeast-1',
          ip: vpsResult.data?.outbound_ip ?? null,
          provider: vpsResult.data?.provider ?? null,
        },
        isFullyOperational: 
          (aiResult.data?.is_active ?? false) && 
          connectedExchanges.length > 0 && 
          vpsResult.data?.status === 'running',
        isLoading: false,
      });
    } catch (err) {
      console.error('[useSystemStatus] Error fetching:', err);
      setStatus(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const checkVpsHealth = useCallback(async () => {
    try {
      console.log('[useSystemStatus] Triggering VPS health check...');
      const { data, error } = await supabase.functions.invoke('check-vps-health');
      if (error) {
        console.error('[useSystemStatus] Health check error:', error);
      } else {
        console.log('[useSystemStatus] Health check result:', data);
      }
      // Refetch status after health check updates the DB
      await fetchStatus();
    } catch (err) {
      console.error('[useSystemStatus] Health check failed:', err);
      // Still fetch status even if health check fails
      await fetchStatus();
    }
  }, [fetchStatus]);

  useEffect(() => {
    // Initial fetch
    fetchStatus();
    
    // Run health check on mount
    checkVpsHealth();

    // Auto-refresh health every 30 seconds
    const healthInterval = setInterval(checkVpsHealth, 30000);

    // Subscribe to realtime changes on all critical tables
    const channel = supabase
      .channel('system-status-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_config' }, fetchStatus)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exchange_connections' }, fetchStatus)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vps_config' }, fetchStatus)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vps_metrics' }, fetchStatus)
      .subscribe();

    return () => {
      clearInterval(healthInterval);
      supabase.removeChannel(channel);
    };
  }, [fetchStatus, checkVpsHealth]);

  return { ...status, refetch: fetchStatus, checkHealth: checkVpsHealth };
}
