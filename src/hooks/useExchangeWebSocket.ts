import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ExchangeBalance {
  id: string;
  exchange_name: string;
  balance_usdt: number;
  is_connected: boolean;
  last_ping_at: string | null;
  balance_updated_at: string | null;
}

interface ExchangeWebSocketState {
  totalBalance: number;
  exchanges: ExchangeBalance[];
  isLive: boolean;
  lastUpdate: Date | null;
  isLoading: boolean;
}

export function useExchangeWebSocket() {
  const [state, setState] = useState<ExchangeWebSocketState>({
    totalBalance: 0,
    exchanges: [],
    isLive: false,
    lastUpdate: null,
    isLoading: true,
  });

  const throttleRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const THROTTLE_MS = 500;
  
  // Throttled state update - NO MOCK DATA, only real balances
  const throttledUpdate = useCallback((exchanges: ExchangeBalance[]) => {
    const now = Date.now();
    
    if (now - lastUpdateRef.current < THROTTLE_MS) {
      if (throttleRef.current) clearTimeout(throttleRef.current);
      throttleRef.current = setTimeout(() => {
        throttledUpdate(exchanges);
      }, THROTTLE_MS - (now - lastUpdateRef.current));
      return;
    }

    lastUpdateRef.current = now;
    
    const connectedExchanges = exchanges.filter(e => e.is_connected);
    // Real balance only - no fallback to fake numbers
    const totalBalance = connectedExchanges.reduce((sum, e) => sum + (e.balance_usdt || 0), 0);

    setState({
      totalBalance,
      exchanges: connectedExchanges,
      isLive: connectedExchanges.length > 0,
      lastUpdate: new Date(),
      isLoading: false,
    });
  }, []);

  // Fetch initial data
  const fetchBalances = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('exchange_connections')
        .select('id, exchange_name, balance_usdt, is_connected, last_ping_at, balance_updated_at');

      if (error) {
        console.error('[useExchangeWebSocket] Fetch error:', error);
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      const exchanges = (data || []) as ExchangeBalance[];
      throttledUpdate(exchanges);
    } catch (err) {
      console.error('[useExchangeWebSocket] Error:', err);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [throttledUpdate]);

  // Trigger edge function to sync balances
  const syncBalances = useCallback(async () => {
    try {
      console.log('[useExchangeWebSocket] Triggering balance sync...');
      const { data, error } = await supabase.functions.invoke('exchange-websocket');
      
      if (error) {
        console.error('[useExchangeWebSocket] Sync error:', error);
      } else {
        console.log('[useExchangeWebSocket] Sync result:', data);
      }
      
      // Refetch after sync
      await fetchBalances();
    } catch (err) {
      console.error('[useExchangeWebSocket] Sync failed:', err);
    }
  }, [fetchBalances]);

  useEffect(() => {
    // Initial fetch
    fetchBalances();
    
    // Initial sync trigger
    syncBalances();

    // Set up realtime subscription
    const channel = supabase
      .channel('exchange-balance-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'exchange_connections'
        },
        (payload) => {
          console.log('[useExchangeWebSocket] Realtime update:', payload);
          fetchBalances();
        }
      )
      .subscribe();

    // Periodic sync every 30 seconds
    const syncInterval = setInterval(syncBalances, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(syncInterval);
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, [fetchBalances, syncBalances]);

  // Test connection for a specific exchange
  const testConnection = useCallback(async (exchangeName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('trade-engine', {
        body: { action: 'test-stored-connection', exchangeName }
      });
      
      if (error) throw error;
      
      // Refetch after test
      await fetchBalances();
      return data;
    } catch (err) {
      console.error('[useExchangeWebSocket] Test connection failed:', err);
      throw err;
    }
  }, [fetchBalances]);

  // Disconnect an exchange
  const disconnect = useCallback(async (exchangeName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('trade-engine', {
        body: { action: 'disconnect-exchange', exchangeName }
      });
      
      if (error) throw error;
      
      // Refetch after disconnect
      await fetchBalances();
      return data;
    } catch (err) {
      console.error('[useExchangeWebSocket] Disconnect failed:', err);
      throw err;
    }
  }, [fetchBalances]);

  return {
    ...state,
    refetch: fetchBalances,
    sync: syncBalances,
    testConnection,
    disconnect,
  };
}
