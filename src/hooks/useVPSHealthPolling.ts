import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface VPSHealthStatus {
  status: 'healthy' | 'unhealthy' | 'unreachable' | 'unknown';
  botStatus: string | null;
  lastVerified: Date | null;
  ipAddress: string | null;
  latencyMs: number | null;
  healthData: Record<string, unknown> | null;
  desync: boolean; // True if VPS state differs from database
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
    healthData: null,
    desync: false,
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

      const { data, error } = await supabase.functions.invoke('bot-control', {
        body: { action: 'status', deploymentId: deployment.id },
      });

      const latencyMs = Date.now() - startTime;

      if (error || !data?.success) {
        setHealth({
          status: 'unreachable',
          botStatus: deployment.bot_status,
          lastVerified: new Date(),
          ipAddress: deployment.ip_address,
          latencyMs,
          healthData: null,
          desync: false,
        });
        return;
      }

      // Parse VPS actual status
      const vpsActualStatus = data.status || 'unknown';
      const dbStatus = deployment.bot_status || 'unknown';
      
      // Check for desync: VPS says running but DB says stopped, or vice versa
      const isDesync = 
        (vpsActualStatus === 'running' && dbStatus !== 'running') ||
        (vpsActualStatus === 'stopped' && dbStatus === 'running');

      setHealth({
        status: data.status === 'running' ? 'healthy' : 'unhealthy',
        botStatus: vpsActualStatus,
        lastVerified: new Date(),
        ipAddress: data.ipAddress || deployment.ip_address,
        latencyMs,
        healthData: data.health || null,
        desync: isDesync,
      });

      // Auto-sync if desync detected
      if (isDesync) {
        console.warn('[VPSHealthPolling] Desync detected! VPS:', vpsActualStatus, 'DB:', dbStatus);
        
        // Update database to match VPS reality
        const updateTime = new Date().toISOString();
        await supabase.from('hft_deployments')
          .update({ bot_status: vpsActualStatus, updated_at: updateTime })
          .eq('id', deployment.id);
        
        await supabase.from('trading_config')
          .update({ 
            bot_status: vpsActualStatus, 
            trading_enabled: vpsActualStatus === 'running',
            updated_at: updateTime 
          })
          .neq('id', '00000000-0000-0000-0000-000000000000');
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
