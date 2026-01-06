import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ExchangeDiagnostics {
  id: string;
  exchange_name: string;
  is_connected: boolean;
  latency_ms: number | null;
  last_ping_at: string | null;
  last_successful_request: string | null;
  ip_whitelisted: boolean;
  whitelisted_range: string | null;
  error_count: number;
  last_error: string | null;
}

export function useAPIDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<ExchangeDiagnostics[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthScore, setHealthScore] = useState(100);

  const fetchDiagnostics = useCallback(async () => {
    try {
      // Fetch exchange connections
      const { data: exchanges, error: exchangeError } = await supabase
        .from('exchange_connections')
        .select('*')
        .order('exchange_name');

      if (exchangeError) {
        console.error('[useAPIDiagnostics] Error fetching exchanges:', exchangeError);
        return;
      }

      // Fetch credential permissions for IP whitelist status
      const { data: permissions, error: permError } = await supabase
        .from('credential_permissions')
        .select('*');

      if (permError) {
        console.error('[useAPIDiagnostics] Error fetching permissions:', permError);
      }

      // Fetch recent API request logs (last 10 per exchange)
      const { data: logs, error: logError } = await supabase
        .from('api_request_logs')
        .select('*')
        .order('request_time', { ascending: false })
        .limit(100);

      if (logError) {
        console.error('[useAPIDiagnostics] Error fetching logs:', logError);
      }

      // Combine data
      const combined = (exchanges || []).map(exchange => {
        const permission = permissions?.find(p => 
          p.provider?.toLowerCase() === exchange.exchange_name?.toLowerCase()
        );
        
        const exchangeLogs = (logs || []).filter(l => 
          l.exchange_name?.toLowerCase() === exchange.exchange_name?.toLowerCase()
        );
        
        const errorLogs = exchangeLogs.filter(l => !l.success);
        const successLogs = exchangeLogs.filter(l => l.success);
        
        return {
          id: exchange.id,
          exchange_name: exchange.exchange_name,
          is_connected: exchange.is_connected || false,
          latency_ms: exchange.last_ping_ms,
          last_ping_at: exchange.last_ping_at,
          last_successful_request: successLogs[0]?.request_time || exchange.last_ping_at,
          ip_whitelisted: permission?.ip_restricted || false,
          whitelisted_range: permission?.whitelisted_range || null,
          error_count: errorLogs.length,
          last_error: errorLogs[0]?.error_message || null
        };
      });

      setDiagnostics(combined);

      // Calculate health score
      const connectedCount = combined.filter(d => d.is_connected).length;
      const totalCount = combined.length || 1;
      const errorPenalty = combined.reduce((sum, d) => sum + Math.min(d.error_count * 5, 20), 0);
      const score = Math.max(0, Math.round((connectedCount / totalCount) * 100 - errorPenalty));
      setHealthScore(score);

    } catch (err) {
      console.error('[useAPIDiagnostics] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const testConnection = useCallback(async (exchangeName: string) => {
    console.log(`[useAPIDiagnostics] Testing connection for ${exchangeName}...`);
    
    try {
      const { error } = await supabase.functions.invoke('exchange-websocket', {
        body: { test: exchangeName }
      });

      if (error) {
        console.error('[useAPIDiagnostics] Test connection error:', error);
      }

      // Refetch diagnostics after test
      await fetchDiagnostics();
    } catch (err) {
      console.error('[useAPIDiagnostics] Test error:', err);
    }
  }, [fetchDiagnostics]);

  useEffect(() => {
    fetchDiagnostics();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('api-diagnostics-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'exchange_connections' },
        () => fetchDiagnostics()
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'api_request_logs' },
        () => fetchDiagnostics()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDiagnostics]);

  return { diagnostics, loading, healthScore, testConnection, refetch: fetchDiagnostics };
}
