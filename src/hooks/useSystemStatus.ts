import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SystemStatus {
  ai: { isActive: boolean; model: string | null };
  exchanges: { connected: number; total: number; balanceUsdt: number };
  vps: { 
    status: string; 
    region: string; 
    ip: string | null; 
    provider: string | null;
    botStatus: string;
    healthStatus: string;
  };
  isFullyOperational: boolean;
  isLoading: boolean;
}

const initialStatus: SystemStatus = {
  ai: { isActive: false, model: null },
  exchanges: { connected: 0, total: 11, balanceUsdt: 0 },
  vps: { status: 'inactive', region: 'ap-northeast-1', ip: null, provider: null, botStatus: 'idle', healthStatus: 'unknown' },
  isFullyOperational: false,
  isLoading: true,
};

export function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus>(initialStatus);
  const prevStatusRef = useRef<SystemStatus | null>(null);

  // Use refs to avoid closure/dependency issues
  const fetchingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    if (fetchingRef.current || !mountedRef.current) return;
    fetchingRef.current = true;

    try {
      // Fetch from all relevant tables for unified status
      const [aiResult, exchangeResult, vpsConfigResult, hftResult, vpsInstanceResult, tradingConfigResult] = await Promise.all([
        supabase.from('ai_config').select('is_active, model').eq('provider', 'groq').maybeSingle(),
        supabase.from('exchange_connections').select('is_connected, balance_usdt'),
        supabase.from('vps_config').select('status, region, outbound_ip, provider').maybeSingle(),
        supabase.from('hft_deployments').select('status, ip_address, provider, bot_status').limit(1).maybeSingle(),
        supabase.from('vps_instances').select('status, ip_address, provider, bot_status').limit(1).maybeSingle(),
        supabase.from('trading_config').select('bot_status').single(),
      ]);

      if (!mountedRef.current) return;

      const connectedExchanges = exchangeResult.data?.filter(e => e.is_connected) || [];
      const totalBalance = connectedExchanges.reduce((sum, e) => sum + (Number(e.balance_usdt) || 0), 0);

      // Unified VPS status calculation - prioritize running status from any source
      const vpsConfig = vpsConfigResult.data;
      const hftDeployment = hftResult.data;
      const vpsInstance = vpsInstanceResult.data;
      const tradingConfig = tradingConfigResult.data;

      // Get IP from any source
      const ip = vpsConfig?.outbound_ip || hftDeployment?.ip_address || vpsInstance?.ip_address || null;
      
      // Get provider from any source
      const provider = vpsConfig?.provider || hftDeployment?.provider || vpsInstance?.provider || null;
      
      // Unified status: running if ANY source shows running
      const isRunning = 
        vpsConfig?.status === 'running' || 
        hftDeployment?.status === 'running' || 
        hftDeployment?.status === 'active' ||
        vpsInstance?.status === 'running';
      
      const isDeploying = 
        vpsConfig?.status === 'deploying' || 
        hftDeployment?.status === 'deploying' ||
        vpsInstance?.status === 'deploying';
      
      const unifiedStatus = isRunning ? 'running' : isDeploying ? 'deploying' : vpsConfig?.status || 'inactive';
      
      // Bot status from trading_config (primary) or hft_deployments/vps_instances
      const botStatus = tradingConfig?.bot_status || hftDeployment?.bot_status || vpsInstance?.bot_status || 'idle';
      
      // Health status - default to healthy if VPS is running with IP
      const healthStatus = (isRunning && ip) ? 'healthy' : 'unknown';

      const newStatus: SystemStatus = {
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
          status: unifiedStatus,
          region: vpsConfig?.region ?? 'ap-northeast-1',
          ip,
          provider,
          botStatus,
          healthStatus,
        },
        isFullyOperational: 
          (aiResult.data?.is_active ?? false) && 
          connectedExchanges.length > 0 && 
          isRunning,
        isLoading: false,
      };

      // Show toast notifications for important state changes
      if (prevStatusRef.current && !prevStatusRef.current.isLoading) {
        const prevVps = prevStatusRef.current.vps;
        
        // VPS recovered from error
        if (prevVps.botStatus === 'error' && botStatus !== 'error') {
          toast.success('VPS recovered from error state');
        }
        
        // VPS came online
        if (prevVps.status !== 'running' && unifiedStatus === 'running' && ip) {
          toast.success(`VPS connected: ${ip}`);
        }
        
        // Bot started
        if (prevVps.botStatus !== 'running' && botStatus === 'running') {
          toast.success('Trading bot started');
        }
        
        // Bot stopped
        if (prevVps.botStatus === 'running' && botStatus === 'stopped') {
          toast.info('Trading bot stopped');
        }
      }

      prevStatusRef.current = newStatus;
      setStatus(newStatus);
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

    // Subscribe to realtime changes - include all VPS-related tables
    const channel = supabase
      .channel('system-status-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_config' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exchange_connections' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vps_config' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vps_metrics' }, handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vps_instances' }, handleRealtimeChange)
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
