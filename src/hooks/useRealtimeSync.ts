import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store/useAppStore';

export const useRealtimeSync = () => {
  useEffect(() => {
    const store = useAppStore.getState();

    const exchangeChannel = supabase
      .channel('realtime-exchange-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exchange_connections' },
        () => {
          console.log('[RealtimeSync] exchange_connections changed');
          store.syncFromDatabase();
        }
      )
      .subscribe();

    const tradeChannel = supabase
      .channel('realtime-trade-sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trading_journal' },
        () => {
          console.log('[RealtimeSync] New trade inserted');
          store.syncFromDatabase();
        }
      )
      .subscribe();

    const hftChannel = supabase
      .channel('realtime-hft-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hft_deployments' },
        () => {
          console.log('[RealtimeSync] hft_deployments changed');
          store.syncFromDatabase();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(exchangeChannel);
      supabase.removeChannel(tradeChannel);
      supabase.removeChannel(hftChannel);
    };
  }, []);
};
