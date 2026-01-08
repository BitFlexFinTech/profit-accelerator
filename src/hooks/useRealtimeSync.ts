import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store/useAppStore';

let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

export const useRealtimeSync = () => {
  const isActiveRef = useRef(true);

  useEffect(() => {
    isActiveRef.current = true;
    const store = useAppStore.getState();

    const setupSubscription = () => {
      const exchangeChannel = supabase
        .channel('realtime-exchange-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'exchange_connections' },
          () => {
            if (isActiveRef.current) {
              console.log('[RealtimeSync] exchange_connections changed');
              store.syncFromDatabase();
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            store.setConnectionStatus('connected');
            if (reconnectTimeout) {
              clearTimeout(reconnectTimeout);
              reconnectTimeout = null;
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[RealtimeSync] Connection lost, reconnecting...');
            store.setConnectionStatus('error');
            reconnectTimeout = setTimeout(setupSubscription, 3000);
          }
        });

      const tradeChannel = supabase
        .channel('realtime-trade-sync')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'trading_journal' },
          () => {
            if (isActiveRef.current) {
              console.log('[RealtimeSync] New trade inserted');
              store.syncFromDatabase();
            }
          }
        )
        .subscribe();

      const hftChannel = supabase
        .channel('realtime-hft-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'hft_deployments' },
          () => {
            if (isActiveRef.current) {
              console.log('[RealtimeSync] hft_deployments changed');
              store.syncFromDatabase();
            }
          }
        )
        .subscribe();

      const ordersChannel = supabase
        .channel('realtime-orders-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          () => {
            if (isActiveRef.current) {
              console.log('[RealtimeSync] orders changed');
              store.syncFromDatabase();
            }
          }
        )
        .subscribe();

      const positionsChannel = supabase
        .channel('realtime-positions-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'positions' },
          () => {
            if (isActiveRef.current) {
              console.log('[RealtimeSync] positions changed');
              store.syncFromDatabase();
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(exchangeChannel);
        supabase.removeChannel(tradeChannel);
        supabase.removeChannel(hftChannel);
        supabase.removeChannel(ordersChannel);
        supabase.removeChannel(positionsChannel);
      };
    };

    const cleanup = setupSubscription();

    // Handle visibility change for reconnection
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        store.syncFromDatabase();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isActiveRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (cleanup) cleanup();
    };
  }, []);
};
