import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface VPSHealthStatus {
  status: 'healthy' | 'unhealthy' | 'unreachable' | 'unknown';
  botStatus: string | null;
  lastVerified: Date | null;
  ipAddress: string | null;
  latencyMs: number | null; // Dashboard-to-VPS latency (for health check)
  tradingLatencyMs: number | null; // VPS-to-Exchange latency (HFT-relevant!)
  healthData: Record<string, unknown> | null;
  desync: boolean; // True if VPS state differs from database
  provider: string | null;
  region: string | null;
}

interface UseVPSHealthPollingOptions {
  pollIntervalMs?: number;
  enabled?: boolean;
}

export function useVPSHealthPolling(options: UseVPSHealthPollingOptions = {}) {
  const { pollIntervalMs = 30000, enabled = true } = options;
  
  const [health, setHealth] = useState<VPSHealthStatus>({
    status: 'unknown',
    botStatus: null,
    lastVerified: null,
    ipAddress: null,
    latencyMs: null,
    tradingLatencyMs: null,
    healthData: null,
    desync: false,
    provider: null,
    region: null,
  });
  const [isPolling, setIsPolling] = useState(false);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Find active deployment
  const findDeployment = useCallback(async () => {
    const { data: deployment } = await supabase
      .from('hft_deployments')
      .select('id, server_id, ip_address, bot_status, status')
      .in('status', ['active', 'running'])
      .limit(1)
      .single();

    if (deployment) {
      setDeploymentId(deployment.id);
      return deployment;
    }

    // Fallback to vps_instances
    const { data: vpsInstance } = await supabase
      .from('vps_instances')
      .select('id, deployment_id, ip_address, bot_status, status')
      .eq('status', 'running')
      .limit(1)
      .single();

    if (vpsInstance) {
      setDeploymentId(vpsInstance.deployment_id || vpsInstance.id);
      return vpsInstance;
    }

    return null;
  }, []);

  // Fetch VPS→Exchange trading latency (HFT-relevant)
  const fetchTradingLatency = useCallback(async (): Promise<number | null> => {
    try {
      const { data } = await supabase
        .from('exchange_pulse')
        .select('latency_ms')
        .eq('source', 'vps');
      
      if (data && data.length > 0) {
        return Math.round(data.reduce((sum, p) => sum + (p.latency_ms || 0), 0) / data.length);
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // Poll VPS health
  const pollHealth = useCallback(async () => {
    if (!enabled) return;
    
    setIsPolling(true);
    const startTime = Date.now();

    try {
      const deployment = await findDeployment();
      
      if (!deployment) {
        setHealth(prev => ({
          ...prev,
          status: 'unknown',
          botStatus: null,
          desync: false,
        }));
        return;
      }

      // Fetch trading latency in parallel with health check
      const [tradingLatency, healthResult] = await Promise.all([
        fetchTradingLatency(),
        supabase.functions.invoke('bot-control', {
          body: { action: 'status', deploymentId: deployment.id },
        })
      ]);

      const { data, error } = healthResult;
      const latencyMs = Date.now() - startTime;

      // Extract provider/region from deployment
      const provider = (deployment as any).provider || null;
      const region = (deployment as any).region || null;

      if (error || !data?.success) {
        setHealth({
          status: 'unreachable',
          botStatus: deployment.bot_status,
          lastVerified: new Date(),
          ipAddress: deployment.ip_address,
          latencyMs,
          tradingLatencyMs: tradingLatency,
          healthData: null,
          desync: false,
          provider,
          region,
        });
        return;
      }

      // Parse VPS actual status - now includes 'standby' state
      const vpsActualStatus = data.status || 'unknown';
      const dbStatus = deployment.bot_status || 'unknown';
      const signalExists = data.signalExists || false;
      const dockerRunning = data.dockerRunning || false;
      
      console.log('[VPSHealthPolling] VPS status:', { 
        vpsActualStatus, 
        dbStatus, 
        signalExists, 
        dockerRunning 
      });
      
      // Check for desync: VPS and DB disagree
      // Important: 'standby' (docker up, no signal) is NOT the same as 'running'
      const normalizedVpsStatus = vpsActualStatus === 'standby' ? 'stopped' : vpsActualStatus;
      const isDesync = normalizedVpsStatus !== dbStatus && 
        !(normalizedVpsStatus === 'unknown' || dbStatus === 'unknown');

      setHealth({
        status: vpsActualStatus === 'running' ? 'healthy' : 
                vpsActualStatus === 'standby' ? 'unhealthy' : 'unhealthy',
        botStatus: vpsActualStatus,
        lastVerified: new Date(),
        ipAddress: data.ipAddress || deployment.ip_address,
        latencyMs,
        tradingLatencyMs: tradingLatency,
        healthData: { 
          ...data.health, 
          signalExists, 
          dockerRunning 
        },
        desync: isDesync,
        provider,
        region,
      });

      // REMOVED: Auto-sync logic that was causing the bug!
      // DO NOT automatically update database when desync is detected.
      // The user must manually click to reconcile.
      if (isDesync) {
        console.warn('[VPSHealthPolling] Desync detected! VPS:', vpsActualStatus, 'DB:', dbStatus);
        console.warn('[VPSHealthPolling] User must manually reconcile - NO auto-sync');
      }
    } catch (err) {
      console.error('[VPSHealthPolling] Error:', err);
      setHealth(prev => ({
        ...prev,
        status: 'unreachable',
        lastVerified: new Date(),
      }));
    } finally {
      setIsPolling(false);
    }
  }, [enabled, findDeployment]);

  // Force sync: reconcile UI state with actual VPS state
  const forceSync = useCallback(async () => {
    await pollHealth();
  }, [pollHealth]);

  // Setup polling interval
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial poll
    pollHealth();

    // Setup interval
    intervalRef.current = setInterval(pollHealth, pollIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, pollIntervalMs, pollHealth]);

  return {
    health,
    isPolling,
    deploymentId,
    refresh: pollHealth,
    forceSync,
  };
}
