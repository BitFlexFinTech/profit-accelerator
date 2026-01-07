import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PulseStatus, getStatusFromVPS } from '@/components/dashboard/panels/VPSPulseIndicator';

interface VPSLiveStatus {
  provider: string;
  status: PulseStatus;
  latencyMs: number | null;
  cpuPercent: number | null;
  memoryPercent: number | null;
  uptimeSeconds: number | null;
  lastChecked: string;
  isPolling: boolean;
  error: string | null;
}

interface UseVPSStatusPollingOptions {
  pollIntervalMs?: number; // Default 30 seconds
  enabled?: boolean;
}

export function useVPSStatusPolling(options: UseVPSStatusPollingOptions = {}) {
  const { pollIntervalMs = 30000, enabled = true } = options;
  
  const [statuses, setStatuses] = useState<Record<string, VPSLiveStatus>>({});
  const [isPolling, setIsPolling] = useState(false);
  const [lastPollTime, setLastPollTime] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const pollVPSStatus = useCallback(async () => {
    if (!enabled || !mountedRef.current) return;
    
    setIsPolling(true);
    
    try {
      // Get all configured VPS from database
      const { data: vpsConfigs } = await supabase
        .from('vps_config')
        .select('id, provider, region, status, outbound_ip');
      
      if (!vpsConfigs || vpsConfigs.length === 0) {
        setStatuses({});
        setIsPolling(false);
        setLastPollTime(new Date());
        return;
      }

      // Get failover configs for additional status info
      const { data: failoverConfigs } = await supabase
        .from('failover_config')
        .select('provider, latency_ms, consecutive_failures, last_health_check');

      const failoverMap = new Map(
        (failoverConfigs || []).map(fc => [fc.provider, fc])
      );

      // Poll each VPS that has an IP configured
      const pollResults = await Promise.all(
        vpsConfigs
          .filter(vps => vps.outbound_ip)
          .map(async (vps) => {
            const startTime = Date.now();
            let result: VPSLiveStatus = {
              provider: vps.provider,
              status: 'unknown',
              latencyMs: null,
              cpuPercent: null,
              memoryPercent: null,
              uptimeSeconds: null,
              lastChecked: new Date().toISOString(),
              isPolling: false,
              error: null,
            };

            try {
              // Call the VPS status poll edge function
              const { data, error } = await supabase.functions.invoke('vps-status-poll', {
                body: {
                  provider: vps.provider,
                  ip: vps.outbound_ip,
                }
              });

              const latency = Date.now() - startTime;

              if (error) {
                throw error;
              }

              const failoverData = failoverMap.get(vps.provider);

              result = {
                provider: vps.provider,
                status: getStatusFromVPS(
                  data?.status || vps.status,
                  data?.latency_ms || latency,
                  failoverData?.consecutive_failures
                ),
                latencyMs: data?.latency_ms || latency,
                cpuPercent: data?.cpu_percent || null,
                memoryPercent: data?.memory_percent || null,
                uptimeSeconds: data?.uptime_seconds || null,
                lastChecked: new Date().toISOString(),
                isPolling: false,
                error: null,
              };
            } catch (err: any) {
              const failoverData = failoverMap.get(vps.provider);
              result = {
                provider: vps.provider,
                status: getStatusFromVPS(
                  vps.status,
                  undefined,
                  failoverData?.consecutive_failures
                ),
                latencyMs: null,
                cpuPercent: null,
                memoryPercent: null,
                uptimeSeconds: null,
                lastChecked: new Date().toISOString(),
                isPolling: false,
                error: err.message || 'Failed to poll status',
              };
            }

            return result;
          })
      );

      // Also add VPS without IPs as unknown
      const vpsWithoutIp = vpsConfigs
        .filter(vps => !vps.outbound_ip)
        .map(vps => ({
          provider: vps.provider,
          status: 'unknown' as PulseStatus,
          latencyMs: null,
          cpuPercent: null,
          memoryPercent: null,
          uptimeSeconds: null,
          lastChecked: new Date().toISOString(),
          isPolling: false,
          error: null,
        }));

      if (mountedRef.current) {
        const statusMap = [...pollResults, ...vpsWithoutIp].reduce(
          (acc, status) => ({ ...acc, [status.provider]: status }),
          {}
        );
        setStatuses(statusMap);
        setLastPollTime(new Date());
      }
    } catch (err) {
      console.error('[VPSStatusPolling] Poll error:', err);
    } finally {
      if (mountedRef.current) {
        setIsPolling(false);
      }
    }
  }, [enabled]);

  // Start polling on mount
  useEffect(() => {
    mountedRef.current = true;

    if (enabled) {
      // Initial poll
      pollVPSStatus();

      // Set up interval
      intervalRef.current = setInterval(pollVPSStatus, pollIntervalMs);
    }

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, pollIntervalMs, pollVPSStatus]);

  // Manual refresh function
  const refresh = useCallback(() => {
    pollVPSStatus();
  }, [pollVPSStatus]);

  // Get status for specific provider
  const getProviderStatus = useCallback(
    (provider: string): VPSLiveStatus | null => {
      return statuses[provider] || null;
    },
    [statuses]
  );

  return {
    statuses,
    isPolling,
    lastPollTime,
    refresh,
    getProviderStatus,
  };
}
