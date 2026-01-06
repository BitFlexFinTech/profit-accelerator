import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface BalanceSnapshot {
  id: string;
  total_balance: number;
  exchange_breakdown: { exchange: string; balance: number }[];
  snapshot_time: string;
}

type TimeRange = '1H' | '24H' | '7D' | '30D';

export function useBalanceHistory(timeRange: TimeRange = '24H') {
  const [history, setHistory] = useState<BalanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [percentChange, setPercentChange] = useState(0);

  const getTimeFilter = useCallback(() => {
    const now = new Date();
    switch (timeRange) {
      case '1H':
        return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      case '24H':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case '7D':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case '30D':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    }
  }, [timeRange]);

  const fetchHistory = useCallback(async () => {
    try {
      const timeFilter = getTimeFilter();
      
      const { data, error } = await supabase
        .from('balance_history')
        .select('*')
        .gte('snapshot_time', timeFilter)
        .order('snapshot_time', { ascending: true });

      if (error) {
        console.error('[useBalanceHistory] Error fetching history:', error);
        return;
      }

      const snapshots = (data || []).map(row => ({
        id: row.id,
        total_balance: Number(row.total_balance) || 0,
        exchange_breakdown: Array.isArray(row.exchange_breakdown) 
          ? row.exchange_breakdown as { exchange: string; balance: number }[]
          : [],
        snapshot_time: row.snapshot_time || ''
      }));

      setHistory(snapshots);

      if (snapshots.length > 0) {
        const latest = snapshots[snapshots.length - 1].total_balance;
        const earliest = snapshots[0].total_balance;
        setCurrentBalance(latest);
        
        if (earliest > 0) {
          const change = ((latest - earliest) / earliest) * 100;
          setPercentChange(change);
        }
      }
    } catch (err) {
      console.error('[useBalanceHistory] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [getTimeFilter]);

  useEffect(() => {
    fetchHistory();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('balance-history-changes')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'balance_history' },
        (payload) => {
          console.log('[useBalanceHistory] New snapshot:', payload.new);
          const newSnapshot = {
            id: payload.new.id,
            total_balance: Number(payload.new.total_balance) || 0,
            exchange_breakdown: Array.isArray(payload.new.exchange_breakdown) 
              ? payload.new.exchange_breakdown as { exchange: string; balance: number }[]
              : [],
            snapshot_time: payload.new.snapshot_time || ''
          };
          setHistory(prev => [...prev, newSnapshot]);
          setCurrentBalance(newSnapshot.total_balance);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchHistory]);

  return { history, loading, currentBalance, percentChange, refetch: fetchHistory };
}
