import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SUPPORTED_EXCHANGES, normalizeExchangeId } from '@/lib/supportedExchanges';

export interface ExchangeConnection {
  id: string;
  exchange_id: string; // normalized ID (e.g., 'okx')
  exchange_name: string; // display name (e.g., 'OKX')
  is_connected: boolean;
  last_ping_ms: number | null;
  balance_usdt: number | null;
  balance_updated_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  color: string;
  needsPassphrase?: boolean;
  isHyperliquid?: boolean;
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

  // Prevent concurrent fetches and debounce rapid updates
  const fetchingRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = useCallback(async () => {
    // Prevent concurrent fetches
    if (fetchingRef.current) return;
    fetchingRef.current = true;

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

      const dbRows = data || [];
      
      // Create a map of DB rows by normalized ID
      const dbMap = new Map<string, typeof dbRows[0]>();
      dbRows.forEach(row => {
        const normalizedId = normalizeExchangeId(row.exchange_name);
        dbMap.set(normalizedId, row);
      });

      // Merge static list with DB data
      const mergedExchanges: ExchangeConnection[] = SUPPORTED_EXCHANGES.map(exchange => {
        const dbRow = dbMap.get(exchange.id);
        
        if (dbRow) {
          return {
            id: dbRow.id,
            exchange_id: exchange.id,
            exchange_name: exchange.name,
            is_connected: dbRow.is_connected ?? false,
            last_ping_ms: dbRow.last_ping_ms,
            balance_usdt: dbRow.balance_usdt,
            balance_updated_at: dbRow.balance_updated_at,
            last_error: dbRow.last_error,
            last_error_at: dbRow.last_error_at,
            color: exchange.color,
            needsPassphrase: exchange.needsPassphrase,
            isHyperliquid: exchange.isHyperliquid,
          };
        }
        
        // No DB row - return disconnected default
        return {
          id: `virtual-${exchange.id}`,
          exchange_id: exchange.id,
          exchange_name: exchange.name,
          is_connected: false,
          last_ping_ms: null,
          balance_usdt: null,
          balance_updated_at: null,
          last_error: null,
          last_error_at: null,
          color: exchange.color,
          needsPassphrase: exchange.needsPassphrase,
          isHyperliquid: exchange.isHyperliquid,
        };
      });

      const connectedCount = mergedExchanges.filter(e => e.is_connected).length;
      const totalBalance = mergedExchanges.reduce((sum, e) => sum + (e.balance_usdt || 0), 0);

      setStatus({
        exchanges: mergedExchanges,
        connectedCount,
        totalBalance,
        isLoading: false
      });
    } catch (err) {
      console.error('[useExchangeStatus] Error:', err);
      setStatus(prev => ({ ...prev, isLoading: false }));
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  // Debounced fetch to prevent rapid re-renders from realtime events
  const debouncedFetch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      fetchStatus();
    }, 500); // Increased from 300ms to 500ms to reduce update frequency
  }, [fetchStatus]);

  useEffect(() => {
    fetchStatus();

    // Subscribe to realtime changes (debounced)
    const channel = supabase
      .channel('exchange_connections_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exchange_connections' },
        debouncedFetch
      )
      .subscribe();

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [fetchStatus, debouncedFetch]);

  return status;
}
