import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TelegramStatus {
  isConnected: boolean;
  chatId: string | null;
  notificationsEnabled: boolean;
  isLoading: boolean;
}

export function useTelegramStatus() {
  const [status, setStatus] = useState<TelegramStatus>({
    isConnected: false,
    chatId: null,
    notificationsEnabled: false,
    isLoading: true
  });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('telegram_config')
          .select('chat_id, notifications_enabled, bot_token')
          .single();

        if (error) {
          console.log('[useTelegramStatus] No config found');
          setStatus(prev => ({ ...prev, isLoading: false }));
          return;
        }

        setStatus({
          isConnected: !!(data?.bot_token && data?.chat_id),
          chatId: data?.chat_id || null,
          notificationsEnabled: data?.notifications_enabled ?? false,
          isLoading: false
        });
      } catch (err) {
        console.error('[useTelegramStatus] Error:', err);
        setStatus(prev => ({ ...prev, isLoading: false }));
      }
    };

    fetchStatus();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('telegram_config_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'telegram_config' },
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
