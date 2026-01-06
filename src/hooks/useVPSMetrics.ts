import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface VPSMetric {
  id: string;
  provider: string;
  cpu_percent: number | null;
  ram_percent: number | null;
  disk_percent: number | null;
  latency_ms: number | null;
  network_in_mbps: number | null;
  network_out_mbps: number | null;
  uptime_seconds: number | null;
  recorded_at: string | null;
}

export function useVPSMetrics() {
  const [metrics, setMetrics] = useState<VPSMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMetrics = async () => {
    try {
      const { data, error } = await supabase
        .from('vps_metrics')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setMetrics(data || []);
    } catch (err) {
      console.error('Failed to fetch VPS metrics:', err);
      setError(err as Error);
      // Set mock data for demo
      setMetrics([{
        id: 'mock-vultr',
        provider: 'vultr',
        cpu_percent: 23,
        ram_percent: 41,
        disk_percent: 15,
        latency_ms: 18,
        network_in_mbps: 0.5,
        network_out_mbps: 1.2,
        uptime_seconds: 1065792, // ~12 days
        recorded_at: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('vps_metrics_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vps_metrics' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setMetrics(prev => {
              const newMetric = payload.new as VPSMetric;
              const existing = prev.findIndex(m => m.provider === newMetric.provider);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = newMetric;
                return updated;
              }
              return [newMetric, ...prev];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { metrics, isLoading, error, refetch: fetchMetrics };
}