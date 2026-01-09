import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useTradeNotifications() {
  useEffect(() => {
    console.log('[useTradeNotifications] Setting up realtime subscription...');
    
    let retryCount = 0;
    const maxRetries = 3;
    let retryTimeout: NodeJS.Timeout | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let isActive = true;

    const handleNewTrade = async (payload: { new: Record<string, unknown> }) => {
      if (!isActive) return;
      
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
    };

    const setupSubscription = () => {
      if (!isActive) return;
      
      channel = supabase
        .channel('trade-notifications')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'trading_journal'
        }, handleNewTrade)
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('[useTradeNotifications] Realtime connected');
            retryCount = 0;
          } else if (status === 'CHANNEL_ERROR') {
            console.warn('[useTradeNotifications] Channel error - scheduling retry');
            // Retry with exponential backoff
            if (retryCount < maxRetries && isActive) {
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
      console.log('[useTradeNotifications] Cleaning up subscription...');
      isActive = false;
      if (channel) supabase.removeChannel(channel);
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, []);
}