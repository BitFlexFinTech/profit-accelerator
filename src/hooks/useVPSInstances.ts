import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Provider, VPSInstance } from '@/types/cloudCredentials';
import { toast } from 'sonner';

interface VPSInstanceRow {
  id: string;
  deployment_id: string | null;
  provider: string;
  provider_instance_id: string | null;
  nickname: string | null;
  ip_address: string | null;
  region: string | null;
  instance_size: string | null;
  status: string | null;
  bot_status: string | null;
  bot_pid: number | null;
  config: Record<string, unknown> | null;
  monthly_cost: number | null;
  created_at: string | null;
  updated_at: string | null;
  last_health_check: string | null;
  uptime_seconds: number | null;
  ssh_private_key: string | null;
}

export interface ProviderStats {
  instanceCount: number;
  totalMonthlyCost: number;
  runningCount: number;
}

export function useVPSInstances() {
  const [instances, setInstances] = useState<VPSInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const transformInstance = (row: VPSInstanceRow): VPSInstance => ({
    id: row.id,
    deploymentId: row.deployment_id || '',
    provider: row.provider as Provider,
    providerInstanceId: row.provider_instance_id || '',
    nickname: row.nickname || undefined,
    ipAddress: row.ip_address || '',
    region: row.region || '',
    instanceSize: row.instance_size || '',
    status: (row.status as VPSInstance['status']) || 'creating',
    botStatus: (row.bot_status as VPSInstance['botStatus']) || 'pending',
    botPid: row.bot_pid || undefined,
    config: row.config as unknown as VPSInstance['config'],
    monthlyCost: row.monthly_cost || 0,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
    lastHealthCheck: row.last_health_check ? new Date(row.last_health_check) : undefined,
    uptimeSeconds: row.uptime_seconds || 0,
  });

  const fetchInstances = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from('vps_instances')
        .select('*')
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;

      const transformedInstances = (data || []).map(transformInstance);
      setInstances(transformedInstances);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch VPS instances';
      setError(message);
      console.error('Error fetching VPS instances:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Subscribe to realtime updates
  useEffect(() => {
    fetchInstances();

    const channel = supabase
      .channel('vps-instances-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vps_instances',
        },
        (payload) => {
          console.log('VPS instances change:', payload);
          
          if (payload.eventType === 'INSERT') {
            const newInstance = transformInstance(payload.new as VPSInstanceRow);
            setInstances((prev) => [newInstance, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updatedInstance = transformInstance(payload.new as VPSInstanceRow);
            setInstances((prev) =>
              prev.map((inst) => (inst.id === updatedInstance.id ? updatedInstance : inst))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            setInstances((prev) => prev.filter((inst) => inst.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInstances]);

  const getInstancesByProvider = useCallback(
    (provider: Provider): VPSInstance[] => {
      return instances.filter((inst) => inst.provider === provider);
    },
    [instances]
  );

  const getProviderStats = useCallback(
    (provider: Provider): ProviderStats => {
      const providerInstances = getInstancesByProvider(provider);
      return {
        instanceCount: providerInstances.length,
        totalMonthlyCost: providerInstances.reduce((sum, inst) => sum + inst.monthlyCost, 0),
        runningCount: providerInstances.filter((inst) => inst.status === 'running').length,
      };
    },
    [getInstancesByProvider]
  );

  const getTotalStats = useCallback((): ProviderStats => {
    return {
      instanceCount: instances.length,
      totalMonthlyCost: instances.reduce((sum, inst) => sum + inst.monthlyCost, 0),
      runningCount: instances.filter((inst) => inst.status === 'running').length,
    };
  }, [instances]);

  const updateInstanceNickname = useCallback(
    async (instanceId: string, nickname: string): Promise<boolean> => {
      try {
        const { error: updateError } = await supabase
          .from('vps_instances')
          .update({ nickname, updated_at: new Date().toISOString() })
          .eq('id', instanceId);

        if (updateError) throw updateError;

        toast.success('Instance nickname updated');
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update nickname';
        toast.error(message);
        return false;
      }
    },
    []
  );

  const deleteInstance = useCallback(
    async (instanceId: string, provider: Provider): Promise<boolean> => {
      try {
        // First, try to destroy the instance via the provider API
        const instance = instances.find((i) => i.id === instanceId);
        if (instance && instance.providerInstanceId) {
          try {
            await supabase.functions.invoke(`${provider}-cloud`, {
              body: {
                action: 'destroy-instance',
                instanceId: instance.providerInstanceId,
              },
            });
          } catch (providerErr) {
            console.warn('Failed to destroy provider instance:', providerErr);
            // Continue with database deletion even if provider fails
          }
        }

        // Delete from database
        const { error: deleteError } = await supabase
          .from('vps_instances')
          .delete()
          .eq('id', instanceId);

        if (deleteError) throw deleteError;

        toast.success('Instance deleted successfully');
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete instance';
        toast.error(message);
        return false;
      }
    },
    [instances]
  );

  const restartBot = useCallback(
    async (instanceId: string): Promise<boolean> => {
      const instance = instances.find((i) => i.id === instanceId);
      if (!instance) {
        toast.error('Instance not found');
        return false;
      }

      try {
        // Update status to show restart in progress
        await supabase
          .from('vps_instances')
          .update({ bot_status: 'pending' })
          .eq('id', instanceId);

        // Call the install-hft-bot function to restart
        const { error: invokeError } = await supabase.functions.invoke('install-hft-bot', {
          body: {
            action: 'restart',
            ipAddress: instance.ipAddress,
            provider: instance.provider,
          },
        });

        if (invokeError) throw invokeError;

        toast.success('Bot restart initiated');
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to restart bot';
        toast.error(message);
        return false;
      }
    },
    [instances]
  );

  const rebootServer = useCallback(
    async (instanceId: string): Promise<boolean> => {
      const instance = instances.find((i) => i.id === instanceId);
      if (!instance) {
        toast.error('Instance not found');
        return false;
      }

      try {
        // Update status
        await supabase
          .from('vps_instances')
          .update({ status: 'rebooting' })
          .eq('id', instanceId);

        // Call provider function to reboot
        const { error: invokeError } = await supabase.functions.invoke(
          `${instance.provider}-cloud`,
          {
            body: {
              action: 'reboot-instance',
              instanceId: instance.providerInstanceId,
            },
          }
        );

        if (invokeError) throw invokeError;

        toast.success('Server reboot initiated');
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to reboot server';
        toast.error(message);
        return false;
      }
    },
    [instances]
  );

  const registerExistingVPS = useCallback(
    async (data: {
      ipAddress: string;
      provider: Provider;
      region?: string;
      nickname?: string;
      sshPrivateKey?: string;
      monthlyCost?: number;
    }): Promise<VPSInstance | null> => {
      try {
        const { data: instance, error: insertError } = await supabase
          .from('vps_instances')
          .insert({
            ip_address: data.ipAddress,
            provider: data.provider,
            region: data.region || 'unknown',
            nickname: data.nickname || `${data.provider}-server`,
            ssh_private_key: data.sshPrivateKey,
            status: 'running',
            bot_status: 'stopped',
            instance_size: 'unknown',
            monthly_cost: data.monthlyCost || 0,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        toast.success('VPS registered successfully');
        return transformInstance(instance);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to register VPS';
        toast.error(message);
        return null;
      }
    },
    []
  );

  return {
    instances,
    loading,
    error,
    refetch: fetchInstances,
    getInstancesByProvider,
    getProviderStats,
    getTotalStats,
    updateInstanceNickname,
    deleteInstance,
    restartBot,
    rebootServer,
    registerExistingVPS,
  };
}
