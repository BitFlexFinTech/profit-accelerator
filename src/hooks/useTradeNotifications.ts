import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useTradeNotifications() {
  useEffect(() => {
    console.log('[useTradeNotifications] Setting up realtime subscription...');

    const channel = supabase
      .channel('trade-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trading_journal'
        },
        async (payload) => {
          console.log('[useTradeNotifications] New trade detected:', payload.new);
          
          const trade = payload.new;
          
          // Send notification via edge function
          try {
            const { error } = await supabase.functions.invoke('telegram-bot', {
              body: {
                action: 'trade-notification',
                trade: {
                  symbol: trade.symbol,
                  entry_price: trade.entry_price,
                  quantity: trade.quantity,
                  side: trade.side,
                  ai_reasoning: trade.ai_reasoning,
                  exchange: trade.exchange
                }
              }
            });

            if (error) {
              console.error('[useTradeNotifications] Failed to send notification:', error);
            } else {
              console.log('[useTradeNotifications] Trade notification sent');
            }
          } catch (err) {
            console.error('[useTradeNotifications] Error:', err);
          }
        }
      )
      .subscribe((status) => {
        console.log('[useTradeNotifications] Subscription status:', status);
        if (status === 'CHANNEL_ERROR') {
          console.warn('[useTradeNotifications] Channel error - will retry on next mount');
        }
      });

    return () => {
      console.log('[useTradeNotifications] Cleaning up subscription...');
      supabase.removeChannel(channel);
    };
  }, []);
}