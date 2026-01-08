import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store/useAppStore';

// This hook now acts as a thin wrapper around useAppStore
// It provides sync actions but reads state from the store (single source of truth)
export function useExchangeWebSocket() {
  const { 
    getTotalEquity, 
    exchangeBalances, 
    isLoading, 
    lastUpdate,
    syncFromDatabase 
  } = useAppStore();
  
  const syncingRef = useRef(false);

  // Get connected exchanges from store
  const exchanges = Object.entries(exchangeBalances)
    .filter(([_, b]) => b.isConnected)
    .map(([name, b]) => ({
      id: name,
      exchange_name: name,
      balance_usdt: b.total,
      is_connected: b.isConnected,
      last_ping_at: b.lastUpdate?.toISOString() || null,
      balance_updated_at: b.lastUpdate?.toISOString() || null
    }));

  // Trigger edge function to sync balances
  const syncBalances = useCallback(async () => {
    if (syncingRef.current) return;
    
    try {
      syncingRef.current = true;
      console.log('[useExchangeWebSocket] Triggering balance sync...');
      const { data, error } = await supabase.functions.invoke('exchange-websocket');
      
      if (error) {
        console.error('[useExchangeWebSocket] Sync error:', error);
      } else {
        console.log('[useExchangeWebSocket] Sync result:', data);
      }
      
      // Refetch via store after sync
      await syncFromDatabase();
    } catch (err) {
      console.error('[useExchangeWebSocket] Sync failed:', err);
    } finally {
      syncingRef.current = false;
    }
  }, [syncFromDatabase]);

  // Test connection for a specific exchange
  const testConnection = useCallback(async (exchangeName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('trade-engine', {
        body: { action: 'test-stored-connection', exchangeName }
      });
      
      if (error) throw error;
      
      // Refetch via store after test
      await syncFromDatabase();
      return data;
    } catch (err) {
      console.error('[useExchangeWebSocket] Test connection failed:', err);
      throw err;
    }
  }, [syncFromDatabase]);

  // Disconnect an exchange
  const disconnect = useCallback(async (exchangeName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('trade-engine', {
        body: { action: 'disconnect-exchange', exchangeName }
      });
      
      if (error) throw error;
      
      // Refetch via store after disconnect
      await syncFromDatabase();
      return data;
    } catch (err) {
      console.error('[useExchangeWebSocket] Disconnect failed:', err);
      throw err;
    }
  }, [syncFromDatabase]);

  return {
    totalBalance: getTotalEquity(),
    exchanges,
    isLive: exchanges.length > 0 && lastUpdate > Date.now() - 60000,
    lastUpdate: lastUpdate ? new Date(lastUpdate) : null,
    isLoading,
    refetch: syncFromDatabase,
    sync: syncBalances,
    testConnection,
    disconnect,
  };
}