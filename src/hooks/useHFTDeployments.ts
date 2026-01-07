import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface HFTDeployment {
  id: string;
  provider: string;
  server_id: string;
  server_name: string | null;
  ip_address: string | null;
  region: string | null;
  server_plan: string | null;
  status: string | null;
  bot_status: string | null;
  ssh_key_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function useHFTDeployments() {
  const [deployments, setDeployments] = useState<HFTDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchDeployments = useCallback(async () => {
    const { data, error } = await supabase
      .from('hft_deployments')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setDeployments(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDeployments();

    // Real-time subscription
    const channel = supabase
      .channel('hft-deployments-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hft_deployments' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setDeployments(prev => [payload.new as HFTDeployment, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setDeployments(prev => 
              prev.map(d => d.id === payload.new.id ? payload.new as HFTDeployment : d)
            );
          } else if (payload.eventType === 'DELETE') {
            setDeployments(prev => prev.filter(d => d.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDeployments]);

  const startBot = async (deploymentId: string) => {
    setActionLoading(deploymentId);
    try {
      const { data, error } = await supabase.functions.invoke('bot-control', {
        body: { action: 'start', deploymentId },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to start bot');

      toast.success('Bot started successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start bot');
    } finally {
      setActionLoading(null);
    }
  };

  const stopBot = async (deploymentId: string) => {
    setActionLoading(deploymentId);
    try {
      const { data, error } = await supabase.functions.invoke('bot-control', {
        body: { action: 'stop', deploymentId },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to stop bot');

      toast.success('Bot stopped successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to stop bot');
    } finally {
      setActionLoading(null);
    }
  };

  const restartBot = async (deploymentId: string) => {
    setActionLoading(deploymentId);
    try {
      const { data, error } = await supabase.functions.invoke('bot-control', {
        body: { action: 'restart', deploymentId },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to restart bot');

      toast.success('Bot restarted successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restart bot');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatus = async (deploymentId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('bot-control', {
        body: { action: 'status', deploymentId },
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Failed to get bot status:', err);
      return null;
    }
  };

  const getTokyoDeployment = useCallback(() => {
    return deployments.find(d => 
      d.region?.includes('nrt') || 
      d.region?.includes('tokyo') || 
      d.region?.includes('ap-northeast') ||
      d.server_name?.toLowerCase().includes('tokyo')
    );
  }, [deployments]);

  return {
    deployments,
    loading,
    actionLoading,
    startBot,
    stopBot,
    restartBot,
    getStatus,
    getTokyoDeployment,
    refetch: fetchDeployments,
  };
}
