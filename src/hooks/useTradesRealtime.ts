import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Trade {
  id: string;
  symbol: string;
  exchange: string;
  side: string;
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  pnl: number | null;
  status: string | null;
  created_at: string | null;
  closed_at: string | null;
  execution_latency_ms?: number | null;
  ai_reasoning?: string | null;
}

/**
 * useTradesRealtime - Single Source of Truth for all trade data
 * 
 * This hook provides:
 * - Real-time updates for INSERT, UPDATE, and DELETE events
 * - Computed values for trade counts and PnL
 * - Connection status monitoring
 * 
 * All trade panels MUST use this hook to ensure data consistency.
 */
export function useTradesRealtime() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');

  const fetchTrades = useCallback(async () => {
    const { data, error } = await supabase
      .from('trading_journal')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setTrades(data as Trade[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTrades();

    let retryCount = 0;
    const maxRetries = 3;
    let retryTimeout: NodeJS.Timeout | null = null;
    let pollingInterval: NodeJS.Timeout | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupSubscription = () => {
      channel = supabase
        .channel('trades-ssot-unified')
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'trading_journal' 
        }, (payload) => {
          console.log('[useTradesRealtime] INSERT:', payload.new);
          setTrades(prev => {
            if (prev.some(t => t.id === (payload.new as Trade).id)) return prev;
            return [payload.new as Trade, ...prev];
          });
          setLastEventAt(new Date());
        })
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'trading_journal' 
        }, (payload) => {
          console.log('[useTradesRealtime] UPDATE:', payload.new);
          setTrades(prev => prev.map(t => 
            t.id === (payload.new as Trade).id ? (payload.new as Trade) : t
          ));
          setLastEventAt(new Date());
        })
        .on('postgres_changes', { 
          event: 'DELETE', 
          schema: 'public', 
          table: 'trading_journal' 
        }, (payload) => {
          console.log('[useTradesRealtime] DELETE:', payload.old);
          setTrades(prev => prev.filter(t => t.id !== (payload.old as any).id));
          setLastEventAt(new Date());
        })
        .subscribe((status) => {
          console.log('[useTradesRealtime] Subscription status:', status);
          if (status === 'SUBSCRIBED') {
            setConnectionStatus('connected');
            retryCount = 0;
            if (pollingInterval) {
              clearInterval(pollingInterval);
              pollingInterval = null;
            }
          } else if (status === 'CHANNEL_ERROR') {
            setConnectionStatus('error');
            // Start polling as fallback
            if (!pollingInterval) {
              pollingInterval = setInterval(fetchTrades, 10000);
            }
            // Retry subscription with backoff
            if (retryCount < maxRetries) {
              retryCount++;
              const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 30000);
              retryTimeout = setTimeout(() => {
                if (channel) supabase.removeChannel(channel);
                setupSubscription();
              }, backoffMs);
            }
          }
        });
    };

    setupSubscription();

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (retryTimeout) clearTimeout(retryTimeout);
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [fetchTrades]);

  // Computed values - single source of truth
  const totalTrades = trades.length;
  const openTrades = trades.filter(t => t.status === 'open');
  const closedTrades = trades.filter(t => t.status === 'closed');
  const totalPnlClosed = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const openCount = openTrades.length;
  const closedCount = closedTrades.length;
  
  // Today's trades
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTrades = closedTrades.filter(t => {
    const tradeDate = new Date(t.closed_at || t.created_at || '');
    return tradeDate >= today;
  });
  const todayPnl = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

  return {
    trades,
    loading,
    totalTrades,
    openTrades,
    closedTrades,
    openCount,
    closedCount,
    totalPnlClosed,
    todayPnl,
    todayTrades,
    lastEventAt,
    connectionStatus,
    refetch: fetchTrades
  };
}
