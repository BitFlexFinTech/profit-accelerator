import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook that periodically triggers rate limit recovery for AI providers.
 * Clears expired cooldowns and resets daily usage at midnight UTC.
 * Runs every 5 minutes.
 */
export function useRateLimitRecovery(intervalMs: number = 5 * 60 * 1000) {
  const mountedRef = useRef(true);
  const lastRunRef = useRef<number>(0);

  useEffect(() => {
    mountedRef.current = true;

    const triggerRecovery = async () => {
      // Prevent running more than once per minute
      const now = Date.now();
      if (now - lastRunRef.current < 60000) {
        return;
      }
      lastRunRef.current = now;

      try {
        const { data, error } = await supabase.functions.invoke('rate-limit-recovery');
        
        if (error) {
          console.error('[useRateLimitRecovery] Error:', error.message);
          return;
        }

        if (data?.success) {
          const { cooldownsCleared, dailyResets, minuteResets } = data;
          if (cooldownsCleared > 0 || dailyResets > 0 || minuteResets > 0) {
            console.log(`[useRateLimitRecovery] Recovered: ${cooldownsCleared} cooldowns, ${dailyResets} daily resets, ${minuteResets} minute resets`);
          }
        }
      } catch (err) {
        console.error('[useRateLimitRecovery] Failed:', err);
      }
    };

    // Run immediately on mount
    triggerRecovery();

    // Run every intervalMs (default 5 minutes)
    const interval = setInterval(() => {
      if (mountedRef.current) {
        triggerRecovery();
      }
    }, intervalMs);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [intervalMs]);
}
