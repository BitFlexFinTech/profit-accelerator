import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';

interface BalanceData {
  success: boolean;
  totalEquity: number;
  balances: Array<{
    exchange: string;
    balance: number;
    assets: Array<{ symbol: string; amount: number; valueUSDT: number }>;
  }>;
  pnl24h: number;
  pnlPercent24h: number;
  exchangeCount: number;
  timestamp: string;
}

export function useLiveBalancePolling(intervalSeconds: number = 5) {
  const [isPolling, setIsPolling] = useState(false);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { setExchangeBalance, setPnlData } = useAppStore();

  const pollBalances = useCallback(async () => {
    try {
      setError(null);
      
      const { data, error: fnError } = await supabase.functions.invoke<BalanceData>('poll-balances');
      
      if (fnError) {
        throw fnError;
      }

      if (data?.success && data.balances) {
        // Update store with new balances
        data.balances.forEach((b) => {
          setExchangeBalance(b.exchange, {
            total: b.balance,
            available: b.balance,
            pnl24h: 0,
            isConnected: true,
            lastUpdate: new Date(data.timestamp),
          });
        });

        // NOTE: Do NOT update PnL here - PnL is calculated from trading_journal
        // in syncFromDatabase(). Updating here causes flashing/overwriting issues.

        setLastPoll(new Date(data.timestamp));
      }
    } catch (err: any) {
      console.error('[useLiveBalancePolling] Poll failed:', err);
      setError(err.message);
    }
  }, [setExchangeBalance, setPnlData]);

  const startPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setIsPolling(true);
    
    // Initial poll
    pollBalances();
    
    // Set up interval
    intervalRef.current = setInterval(pollBalances, intervalSeconds * 1000);
    
    console.log(`[useLiveBalancePolling] Started polling every ${intervalSeconds}s`);
  }, [pollBalances, intervalSeconds]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
    console.log('[useLiveBalancePolling] Stopped polling');
  }, []);

  const triggerManualPoll = useCallback(async () => {
    toast.info('Refreshing balances...');
    await pollBalances();
    toast.success('Balances updated');
  }, [pollBalances]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    isPolling,
    lastPoll,
    error,
    startPolling,
    stopPolling,
    triggerManualPoll,
  };
}
