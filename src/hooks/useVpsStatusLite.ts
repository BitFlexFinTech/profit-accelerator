import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface VpsStatusLite {
  status: string;
  ip: string | null;
  provider: string | null;
  isActive: boolean;
  isLoading: boolean;
}

const initialState: VpsStatusLite = {
  status: 'inactive',
  ip: null,
  provider: null,
  isActive: false,
  isLoading: true,
};

/**
 * Lightweight VPS status hook that ONLY returns what's needed for display purposes.
 * Does NOT subscribe to vps_metrics to prevent high-frequency rerenders.
 * Updates only on actual VPS state changes (deployments, instances, config).
 */
export function useVpsStatusLite(): VpsStatusLite {
  const [state, setState] = useState<VpsStatusLite>(initialState);
  const fetchingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const lastSignatureRef = useRef<string>('');

  const fetchStatus = useCallback(async () => {
    if (fetchingRef.current || !mountedRef.current) return;
    fetchingRef.current = true;

    try {
      // Only fetch VPS-related tables - NOT vps_metrics
      const [vpsConfigResult, hftResult, vpsInstanceResult] = await Promise.all([
        supabase.from('vps_config').select('status, outbound_ip, provider').maybeSingle(),
        supabase.from('hft_deployments').select('status, ip_address, provider').limit(1).maybeSingle(),
        supabase.from('vps_instances').select('status, ip_address, provider').limit(1).maybeSingle(),
      ]);

      if (!mountedRef.current) return;

      const vpsConfig = vpsConfigResult.data;
      const hftDeployment = hftResult.data;
      const vpsInstance = vpsInstanceResult.data;

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
      
      const status = isRunning ? 'running' : isDeploying ? 'deploying' : vpsConfig?.status || 'inactive';
      const isActive = isRunning || (status === 'idle' && !!ip);

      // Create signature to prevent unnecessary state updates
      const signature = `${status}|${ip}|${provider}|${isActive}`;
      
      if (signature !== lastSignatureRef.current) {
        lastSignatureRef.current = signature;
        setState({
          status,
          ip,
          provider,
          isActive,
          isLoading: false,
        });
      } else if (state.isLoading) {
        // Clear loading state even if data unchanged
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } catch (err) {
      console.error('[useVpsStatusLite] Error:', err);
      if (mountedRef.current) {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } finally {
      fetchingRef.current = false;
    }
  }, [state.isLoading]);

  const debouncedFetch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        fetchStatus();
      }
    }, 500);
  }, [fetchStatus]);

  useEffect(() => {
    mountedRef.current = true;
    fetchStatus();

    // Subscribe to VPS state tables only - NOT vps_metrics
    const channel = supabase
      .channel('vps-status-lite')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vps_config' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vps_instances' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hft_deployments' }, debouncedFetch)
      .subscribe();

    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [fetchStatus, debouncedFetch]);

  return state;
}
