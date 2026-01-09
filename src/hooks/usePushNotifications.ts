import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    const supported = 'Notification' in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
      setIsEnabled(Notification.permission === 'granted');
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      toast.error('Push notifications not supported in this browser');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      setIsEnabled(result === 'granted');
      
      if (result === 'granted') {
        toast.success('Push notifications enabled!');
        return true;
      } else if (result === 'denied') {
        toast.error('Push notifications denied. Enable in browser settings.');
        return false;
      } else {
        toast.info('Push notification permission dismissed');
        return false;
      }
    } catch (err) {
      console.error('[usePushNotifications] Error requesting permission:', err);
      toast.error('Failed to request notification permission');
      return false;
    }
  }, [isSupported]);

  const sendNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (permission !== 'granted') return null;
    
    try {
      const notification = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: options?.tag || 'trade-alert',
        ...options,
      });
      
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      
      return notification;
    } catch (err) {
      console.error('[usePushNotifications] Error sending notification:', err);
      return null;
    }
  }, [permission]);

  // Subscribe to high-confidence trade alerts
  useEffect(() => {
    if (permission !== 'granted') return;

    const channel = supabase
      .channel('push-trade-alerts')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ai_market_updates'
      }, (payload) => {
        const update = payload.new as {
          symbol: string;
          sentiment: string;
          confidence: number;
          recommended_side: string;
          ai_provider: string;
        };
        
        // Only notify for high-confidence signals (80%+)
        if (update.confidence >= 80) {
          const emoji = update.sentiment === 'BULLISH' ? '🟢' : update.sentiment === 'BEARISH' ? '🔴' : '⚪';
          const side = update.recommended_side === 'short' ? 'SHORT' : 'LONG';
          
          sendNotification(`${emoji} ${update.symbol} - ${side}`, {
            body: `${update.confidence}% confidence via ${update.ai_provider?.toUpperCase() || 'AI'}`,
            tag: `trade-${update.symbol}-${Date.now()}`,
          });
        }
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[usePushNotifications] Channel error');
        }
      });

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [permission, sendNotification]);

  return { 
    isSupported, 
    permission, 
    isEnabled,
    requestPermission, 
    sendNotification 
  };
}
