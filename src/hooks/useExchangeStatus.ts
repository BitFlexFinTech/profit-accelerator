import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ExchangeConnection {
  id: string;
  exchange_name: string;
  is_connected: boolean;
  last_ping_ms: number | null;
  balance_usdt: number | null;
  balance_updated_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
}

interface ExchangeStatus {
  exchanges: ExchangeConnection[];
  connectedCount: number;
  totalBalance: number;
  isLoading: boolean;
}

export function useExchangeStatus() {
  const [status, setStatus] = useState<ExchangeStatus>({
    exchanges: [],
    connectedCount: 0,
    totalBalance: 0,
    isLoading: true
  });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('exchange_connections')
          .select('id, exchange_name, is_connected, last_ping_ms, balance_usdt, balance_updated_at, last_error, last_error_at')
          .order('exchange_name');

        if (error) {
          console.error('[useExchangeStatus] Error:', error);
          setStatus(prev => ({ ...prev, isLoading: false }));
          return;
        }

        const exchanges = data || [];
        const connectedCount = exchanges.filter(e => e.is_connected).length;
        const totalBalance = exchanges.reduce((sum, e) => sum + (e.balance_usdt || 0), 0);

        setStatus({
          exchanges,
          connectedCount,
          totalBalance,
          isLoading: false
        });
      } catch (err) {
        console.error('[useExchangeStatus] Error:', err);
        setStatus(prev => ({ ...prev, isLoading: false }));
      }
    };

    fetchStatus();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('exchange_connections_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exchange_connections' },
        () => {
          fetchStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return status;
}
