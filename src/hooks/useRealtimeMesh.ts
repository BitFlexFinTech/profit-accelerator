import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

interface VPSNode {
  id: string;
  provider: string;
  region: string;
  status: string | null;
  outbound_ip: string | null;
  latency_ms?: number;
  is_primary?: boolean;
  consecutive_failures?: number;
  last_health_check?: string;
}

interface VPSMetric {
  id: string;
  provider: string;
  cpu_percent: number | null;
  ram_percent: number | null;
  disk_percent: number | null;
  network_in_mbps: number | null;
  network_out_mbps: number | null;
  latency_ms: number | null;
  uptime_seconds: number | null;
  recorded_at: string | null;
}

interface FailoverEvent {
  id: string;
  from_provider: string;
  to_provider: string;
  reason: string | null;
  is_automatic: boolean | null;
  triggered_at: string | null;
}

interface MeshState {
  nodes: VPSNode[];
  metrics: Record<string, VPSMetric>;
  activeProvider: string | null;
  lastFailover: FailoverEvent | null;
  isConnected: boolean;
}

export function useRealtimeMesh() {
  const [state, setState] = useState<MeshState>({
    nodes: [],
    metrics: {},
    activeProvider: null,
    lastFailover: null,
    isConnected: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial data
  const fetchInitialData = useCallback(async () => {
    try {
      // Fetch VPS configs joined with failover data
      const { data: vpsConfigs } = await supabase
        .from('vps_config')
        .select('id, provider, region, status, outbound_ip');

      const { data: failoverConfigs } = await supabase
        .from('failover_config')
        .select('provider, priority, is_primary, is_enabled, region, latency_ms, consecutive_failures, last_health_check, auto_failover_enabled')
        .eq('is_enabled', true)
        .order('priority');

      // Merge VPS and failover data
      const nodes: VPSNode[] = (failoverConfigs || []).map(fc => {
        const vps = vpsConfigs?.find(v => v.provider === fc.provider);
        return {
          id: vps?.id || fc.provider,
          provider: fc.provider,
          region: fc.region || vps?.region || 'unknown',
          status: vps?.status || 'not_configured',
          outbound_ip: vps?.outbound_ip || null,
          latency_ms: fc.latency_ms || undefined,
          is_primary: fc.is_primary || false,
          consecutive_failures: fc.consecutive_failures || 0,
          last_health_check: fc.last_health_check || undefined,
        };
      });

      // Find active provider
      const activeProvider = failoverConfigs?.find(fc => fc.is_primary)?.provider || null;

      // Fetch latest metrics for each provider
      const metricsMap: Record<string, VPSMetric> = {};
      for (const node of nodes) {
        const { data: metric } = await supabase
          .from('vps_metrics')
          .select('*')
          .eq('provider', node.provider)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .single();
        
        if (metric) {
          metricsMap[node.provider] = metric;
        }
      }

      // Fetch last failover event
      const { data: lastFailover } = await supabase
        .from('failover_events')
        .select('*')
        .order('triggered_at', { ascending: false })
        .limit(1)
        .single();

      setState(prev => ({
        ...prev,
        nodes,
        metrics: metricsMap,
        activeProvider,
        lastFailover: lastFailover || null,
      }));
    } catch (error) {
      console.error('[RealtimeMesh] Error fetching initial data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();

    // Set up real-time subscriptions
    let meshChannel: RealtimeChannel;

    const setupRealtimeSubscriptions = () => {
      meshChannel = supabase
        .channel('mesh-realtime-sync')
        // VPS Config changes
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'vps_config'
        }, (payload) => {
          console.log('[RealtimeMesh] VPS config update:', payload);
          const newData = payload.new as VPSNode;
          
          setState(prev => ({
            ...prev,
            nodes: prev.nodes.map(node => 
              node.provider === newData.provider 
                ? { ...node, ...newData }
                : node
            ),
          }));
        })
        // Failover Config changes (latency, primary status)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'failover_config'
        }, (payload) => {
          console.log('[RealtimeMesh] Failover config update:', payload);
          const newData = payload.new as { 
            provider: string; 
            is_primary?: boolean; 
            latency_ms?: number;
            consecutive_failures?: number;
          };
          
          setState(prev => {
            const updatedNodes = prev.nodes.map(node => 
              node.provider === newData.provider 
                ? { 
                    ...node, 
                    is_primary: newData.is_primary ?? node.is_primary,
                    latency_ms: newData.latency_ms ?? node.latency_ms,
                    consecutive_failures: newData.consecutive_failures ?? node.consecutive_failures,
                  }
                : { ...node, is_primary: newData.is_primary ? false : node.is_primary }
            );
            
            const newActiveProvider = newData.is_primary ? newData.provider : prev.activeProvider;
            
            return {
              ...prev,
              nodes: updatedNodes,
              activeProvider: newActiveProvider,
            };
          });
        })
        // VPS Metrics updates
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'vps_metrics'
        }, (payload) => {
          console.log('[RealtimeMesh] New VPS metrics:', payload);
          const newMetric = payload.new as VPSMetric;
          
          setState(prev => ({
            ...prev,
            metrics: {
              ...prev.metrics,
              [newMetric.provider]: newMetric,
            },
          }));
        })
        // Failover events
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'failover_events'
        }, (payload) => {
          console.log('[RealtimeMesh] Failover event:', payload);
          const event = payload.new as FailoverEvent;
          
          setState(prev => ({
            ...prev,
            lastFailover: event,
            activeProvider: event.to_provider,
          }));
        })
        .subscribe((status) => {
          console.log('[RealtimeMesh] Subscription status:', status);
          setState(prev => ({ ...prev, isConnected: status === 'SUBSCRIBED' }));
        });
    };

    setupRealtimeSubscriptions();

    return () => {
      if (meshChannel) {
        supabase.removeChannel(meshChannel);
      }
    };
  }, [fetchInitialData]);

  // Manual failover function
  const triggerFailover = useCallback(async (fromProvider: string, toProvider: string) => {
    try {
      const { error } = await supabase.functions.invoke('failover-monitor', {
        body: {
          action: 'manual-switch',
          from_provider: fromProvider,
          to_provider: toProvider,
        }
      });

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('[RealtimeMesh] Failover error:', error);
      return { success: false, error };
    }
  }, []);

  // Refresh mesh data
  const refresh = useCallback(() => {
    setIsLoading(true);
    fetchInitialData();
  }, [fetchInitialData]);

  return {
    ...state,
    isLoading,
    triggerFailover,
    refresh,
  };
}
