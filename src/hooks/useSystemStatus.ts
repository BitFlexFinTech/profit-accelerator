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
  lastHealthCheck: Date | null;
  isHealthChecking: boolean;
}

const initialStatus: SystemStatus = {
  ai: { isActive: false, model: null },
  exchanges: { connected: 0, total: 11, balanceUsdt: 0 },
  vps: { status: 'inactive', region: 'ap-northeast-1', ip: null, provider: null, botStatus: 'idle', healthStatus: 'unknown' },
  isFullyOperational: false,
  isLoading: true,
  lastHealthCheck: null,
  isHealthChecking: false,
};

// Polling intervals
const HEALTHY_POLL_INTERVAL = 60000; // 60 seconds when healthy (increased from 30s)
const ERROR_POLL_INTERVAL = 30000;   // 30 seconds after error (increased from 10s)
const MAX_RETRIES = 3;
const MAX_CONSECUTIVE_FAILURES = 5;  // Stop health checks after this many consecutive failures

export function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus>(initialStatus);
  const prevStatusRef = useRef<SystemStatus | null>(null);
  const [healthCheckDisabled, setHealthCheckDisabled] = useState(false);

  // Use refs to avoid closure/dependency issues
  const fetchingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const healthIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  const consecutiveFailuresRef = useRef(0);
  const currentIntervalRef = useRef(HEALTHY_POLL_INTERVAL);

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
        supabase.from('trading_config').select('bot_status').maybeSingle(),
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
        lastHealthCheck: status.lastHealthCheck,
        isHealthChecking: status.isHealthChecking,
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
  }, [status.lastHealthCheck, status.isHealthChecking]);

  const checkVpsHealth = useCallback(async () => {
    if (!mountedRef.current || healthCheckDisabled) return;
    
    setStatus(prev => ({ ...prev, isHealthChecking: true }));
    
    let success = false;
    let retries = 0;
    
    // Retry logic with exponential backoff - silent failures
    while (retries < MAX_RETRIES && !success && mountedRef.current) {
      try {
        const { error } = await supabase.functions.invoke('check-vps-health');
        if (error) {
          // Silent log - don't spam console
          if (retries === MAX_RETRIES - 1) {
            console.warn('[useSystemStatus] Health check failed after max retries');
          }
          retries++;
          if (retries < MAX_RETRIES) {
            // Exponential backoff: 1s, 2s, 4s
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries - 1)));
          }
        } else {
          success = true;
          retryCountRef.current = 0;
          consecutiveFailuresRef.current = 0;
        }
      } catch {
        // Silent failure - edge function not available
        retries++;
        if (retries < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries - 1)));
        }
      }
    }
    
    if (mountedRef.current) {
      const now = new Date();
      setStatus(prev => ({ 
        ...prev, 
        lastHealthCheck: now,
        isHealthChecking: false 
      }));
      
      // Track consecutive failures and disable health checks if too many
      if (!success) {
        consecutiveFailuresRef.current++;
        retryCountRef.current++;
        
        // Stop health checks after too many consecutive failures
        if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
          console.warn('[useSystemStatus] Health checks disabled after repeated failures. Manual retry required.');
          setHealthCheckDisabled(true);
          if (healthIntervalRef.current) {
            clearInterval(healthIntervalRef.current);
            healthIntervalRef.current = null;
          }
          toast.error('VPS health checks disabled due to repeated failures. Check VPS settings.');
        } else if (currentIntervalRef.current !== ERROR_POLL_INTERVAL) {
          // Switch to slower error polling
          currentIntervalRef.current = ERROR_POLL_INTERVAL;
          updateHealthCheckInterval();
        }
      } else {
        // Switch back to normal polling after success
        if (currentIntervalRef.current !== HEALTHY_POLL_INTERVAL) {
          currentIntervalRef.current = HEALTHY_POLL_INTERVAL;
          updateHealthCheckInterval();
        }
      }
      
      await fetchStatus();
    }
  }, [fetchStatus, healthCheckDisabled]);

  // Update health check interval dynamically
  const updateHealthCheckInterval = useCallback(() => {
    if (healthIntervalRef.current) {
      clearInterval(healthIntervalRef.current);
    }
    if (mountedRef.current) {
      healthIntervalRef.current = setInterval(() => {
        if (mountedRef.current) {
          checkVpsHealth();
        }
      }, currentIntervalRef.current);
    }
  }, [checkVpsHealth]);

  useEffect(() => {
    mountedRef.current = true;

    // Debounced fetch handler for realtime events (increased debounce to reduce updates)
    const handleRealtimeChange = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          fetchStatus();
        }
      }, 500); // Increased from 300ms to 500ms
    };

    // Initial fetch
    fetchStatus();
    
    // Run health check on mount (delayed to prevent race)
    const healthCheckTimeout = setTimeout(() => {
      if (mountedRef.current) {
        checkVpsHealth();
      }
    }, 1000);

    // Auto-refresh health with adaptive interval
    healthIntervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        checkVpsHealth();
      }
    }, currentIntervalRef.current);

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
      if (healthIntervalRef.current) {
        clearInterval(healthIntervalRef.current);
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [fetchStatus, checkVpsHealth]);

  // Manual retry function to re-enable health checks
  const retryHealthChecks = useCallback(() => {
    setHealthCheckDisabled(false);
    consecutiveFailuresRef.current = 0;
    retryCountRef.current = 0;
    currentIntervalRef.current = HEALTHY_POLL_INTERVAL;
    checkVpsHealth();
  }, [checkVpsHealth]);

  return { 
    ...status, 
    refetch: fetchStatus, 
    checkHealth: checkVpsHealth,
    healthCheckDisabled,
    retryHealthChecks,
  };
}
