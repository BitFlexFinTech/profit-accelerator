import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

type ConfirmationState = 'idle' | 'waiting' | 'confirmed' | 'timeout';

interface UseRealtimeConfirmationOptions {
  table: string;
  matchColumn: string;
  matchValue: string;
  timeoutMs?: number;
}

export function useRealtimeConfirmation({
  table,
  matchColumn,
  matchValue,
  timeoutMs = 5000,
}: UseRealtimeConfirmationOptions) {
  const [state, setState] = useState<ConfirmationState>('idle');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const startWaiting = useCallback(() => {
    cleanup();
    setState('waiting');

    // Set up timeout
    timeoutRef.current = setTimeout(() => {
      setState('timeout');
      cleanup();
    }, timeoutMs);

    // Subscribe to table changes
    channelRef.current = supabase
      .channel(`confirmation-${table}-${matchValue}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `${matchColumn}=eq.${matchValue}`,
        },
        () => {
          setState('confirmed');
          cleanup();
        }
      )
      .subscribe();
  }, [table, matchColumn, matchValue, timeoutMs, cleanup]);

  const reset = useCallback(() => {
    cleanup();
    setState('idle');
  }, [cleanup]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    state,
    isWaiting: state === 'waiting',
    isConfirmed: state === 'confirmed',
    isTimeout: state === 'timeout',
    startWaiting,
    reset,
  };
}
