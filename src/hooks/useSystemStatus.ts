import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SystemStatus {
  ai: { isActive: boolean; model: string | null };
  exchanges: { connected: number; total: number; balanceUsdt: number };
  vps: { status: string; region: string; ip: string | null; provider: string | null };
  isFullyOperational: boolean;
  isLoading: boolean;
}

const initialStatus: SystemStatus = {
  ai: { isActive: false, model: null },
  exchanges: { connected: 0, total: 11, balanceUsdt: 0 },
  vps: { status: 'inactive', region: 'ap-northeast-1', ip: null, provider: null },
  isFullyOperational: false,
  isLoading: true,
};

export function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus>(initialStatus);

  // Use refs to avoid closure/dependency issues
  const fetchingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    if (fetchingRef.current || !mountedRef.current) return;
    fetchingRef.current = true;

    try {
      const [aiResult, exchangeResult, vpsResult] = await Promise.all([
        supabase.from('ai_config').select('is_active, model').eq('provider', 'groq').maybeSingle(),
        supabase.from('exchange_connections').select('is_connected, balance_usdt'),
        supabase.from('vps_config').select('status, region, outbound_ip, provider').maybeSingle(),
      ]);

      if (!mountedRef.current) return;

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
      if (mountedRef.current) {
        setStatus(prev => ({ ...prev, isLoading: false }));
      }
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  const checkVpsHealth = useCallback(async () => {
    if (!mountedRef.current) return;
    
    try {
      const { error } = await supabase.functions.invoke('check-vps-health');
      if (error) {
        console.error('[useSystemStatus] Health check error:', error);
      }
    } catch (err) {
      console.error('[useSystemStatus] Health check failed:', err);
    }
    
    // Always refetch after health check
    if (mountedRef.current) {
      await fetchStatus();
    }
  }, [fetchStatus]);

  useEffect(() => {
    mountedRef.current = true;

    // Debounced fetch handler for realtime events
    const handleRealtimeChange = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          fetchStatus();
        }
      }, 300);
    };

    // Initial fetch
    fetchStatus();
    
    // Run health check on mount (delayed to prevent race)
    const healthCheckTimeout = setTimeout(() => {
      if (mountedRef.current) {
        checkVpsHealth();
      }
    }, 1000);

    // Auto-refresh health every 30 seconds
    const healthInterval = setInterval(() => {
      if (mountedRef.current) {
        checkVpsHealth();
      }
    }, 30000);

    // Subscribe to realtime changes - include hft_deployments and trading_config for bot status
    const channel = supabase
      .channel('system-status-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_config' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exchange_connections' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vps_config' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vps_metrics' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hft_deployments' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trading_config' }, handleRealtimeChange)
      .subscribe();

    return () => {
      mountedRef.current = false;
      clearTimeout(healthCheckTimeout);
      clearInterval(healthInterval);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [fetchStatus, checkVpsHealth]);

  return { ...status, refetch: fetchStatus, checkHealth: checkVpsHealth };
}
