import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TradeExecutionMetric {
  id: string;
  exchange: string;
  symbol: string | null;
  order_type: string | null;
  execution_time_ms: number;
  order_placed_at: string;
  order_filled_at: string | null;
  api_response_time_ms: number | null;
  network_latency_ms: number | null;
  created_at: string | null;
}

interface LatencyStats {
  avg: number;
  min: number;
  max: number;
  count: number;
  distribution: {
    under25: number;
    under50: number;
    under100: number;
    over100: number;
  };
}

type TimeRange = '5m' | '1h' | '24h';

export function useTradeExecutionMetrics() {
  const [metrics, setMetrics] = useState<TradeExecutionMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');

  const getTimeFilter = useCallback((range: TimeRange): string => {
    const now = new Date();
    switch (range) {
      case '5m':
        return new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    }
  }, []);

  const fetchMetrics = useCallback(async () => {
    const timeFilter = getTimeFilter(timeRange);
    const { data, error } = await supabase
      .from('trade_execution_metrics')
      .select('*')
      .gte('order_placed_at', timeFilter)
      .order('order_placed_at', { ascending: false });

    if (!error && data) {
      setMetrics(data);
    }
    setLoading(false);
  }, [timeRange, getTimeFilter]);

  useEffect(() => {
    fetchMetrics();

    // Real-time subscription
    const channel = supabase
      .channel('trade-execution-metrics')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trade_execution_metrics' },
        (payload) => {
          setMetrics(prev => [payload.new as TradeExecutionMetric, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMetrics]);

  const getLatencyStats = useCallback((exchange: string): LatencyStats => {
    const exchangeMetrics = metrics.filter(m => m.exchange.toLowerCase() === exchange.toLowerCase());
    
    if (exchangeMetrics.length === 0) {
      return {
        avg: 0,
        min: 0,
        max: 0,
        count: 0,
        distribution: { under25: 0, under50: 0, under100: 0, over100: 0 }
      };
    }

    const latencies = exchangeMetrics.map(m => m.execution_time_ms);
    const sum = latencies.reduce((a, b) => a + b, 0);
    
    const distribution = {
      under25: latencies.filter(l => l < 25).length,
      under50: latencies.filter(l => l >= 25 && l < 50).length,
      under100: latencies.filter(l => l >= 50 && l < 100).length,
      over100: latencies.filter(l => l >= 100).length,
    };

    return {
      avg: Math.round(sum / latencies.length),
      min: Math.min(...latencies),
      max: Math.max(...latencies),
      count: latencies.length,
      distribution,
    };
  }, [metrics]);

  const getAllExchangeStats = useCallback(() => {
    const exchanges = [...new Set(metrics.map(m => m.exchange.toLowerCase()))];
    return exchanges.map(exchange => ({
      exchange,
      stats: getLatencyStats(exchange),
    }));
  }, [metrics, getLatencyStats]);

  return {
    metrics,
    loading,
    timeRange,
    setTimeRange,
    getLatencyStats,
    getAllExchangeStats,
    refetch: fetchMetrics,
  };
}
