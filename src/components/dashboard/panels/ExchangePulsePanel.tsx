import { useState, useEffect, forwardRef } from 'react';
import { Activity, CheckCircle2, XCircle, RefreshCw, Server, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ExchangePulse {
  id: string;
  exchange_name: string;
  status: 'healthy' | 'jitter' | 'error';
  latency_ms: number;
  source?: 'edge' | 'vps';
}

const EXCHANGE_DISPLAY: Record<string, { name: string }> = {
  binance: { name: 'BIN' },
  okx: { name: 'OKX' },
  bybit: { name: 'BYB' },
  bitget: { name: 'BGT' },
  kucoin: { name: 'KUC' },
  mexc: { name: 'MEX' },
};

interface ExchangePulsePanelProps {
  compact?: boolean;
}

export const ExchangePulsePanel = forwardRef<HTMLDivElement, ExchangePulsePanelProps>(({ compact = false }, ref) => {
  const [pulses, setPulses] = useState<ExchangePulse[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchPulses();
    const channel = supabase
      .channel('exchange-pulse-compact')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'exchange_pulse'
      }, () => fetchPulses())
      .subscribe();

    const interval = setInterval(fetchPulses, 30000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const fetchPulses = async () => {
    try {
      // First get connected exchanges to prioritize them
      const { data: connections } = await supabase
        .from('exchange_connections')
        .select('exchange_name')
        .eq('is_connected', true);
      
      const connectedNames = connections?.map(c => c.exchange_name.toLowerCase()) || [];
      
      const { data, error } = await supabase
        .from('exchange_pulse')
        .select('id, exchange_name, status, latency_ms, source')
        .order('exchange_name')
        .limit(6);

      if (error) throw error;
      
      // Sort: connected exchanges (Binance, OKX) first
      const sorted = [...(data || [])].sort((a, b) => {
        const aConnected = connectedNames.includes(a.exchange_name.toLowerCase());
        const bConnected = connectedNames.includes(b.exchange_name.toLowerCase());
        if (aConnected && !bConnected) return -1;
        if (!aConnected && bConnected) return 1;
        return a.exchange_name.localeCompare(b.exchange_name);
      });
      
      setPulses(sorted as ExchangePulse[]);
    } catch (err) {
      console.error('[ExchangePulsePanel] Error:', err);
    }
  };

  const refreshPulses = async () => {
    setIsRefreshing(true);
    try {
      await supabase.functions.invoke('trade-engine', {
        body: { action: 'ping-all-exchanges' }
      });
      await fetchPulses();
      toast.success('Pulses refreshed');
    } catch (err) {
      toast.error('Refresh failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  const getLatencyColor = (latency: number, source?: string) => {
    const threshold = source === 'vps' ? 50 : 100;
    if (latency < threshold) return 'text-green-400';
    if (latency < threshold * 3) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'healthy') return <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />;
    if (status === 'jitter') return <AlertTriangle className="w-2.5 h-2.5 text-yellow-400" />;
    return <XCircle className="w-2.5 h-2.5 text-red-400" />;
  };

  const healthyCount = pulses.filter(p => p.status === 'healthy').length;
  const isVPS = pulses.some(p => p.source === 'vps');

  return (
    <div ref={ref} className={`glass-card ${compact ? 'p-2' : 'p-4'} h-full flex flex-col`}>
      <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Activity className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} text-primary animate-pulse`} />
          <span className={`font-medium ${compact ? 'text-xs' : 'text-sm'}`}>Exchange Pulse</span>
          {isVPS && (
            <span className="flex items-center gap-0.5 text-[9px] text-green-400 bg-green-500/10 px-1 rounded">
              <Server className="w-2 h-2" />VPS
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">{healthyCount}/{pulses.length}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshPulses}
            disabled={isRefreshing}
            className={compact ? "h-5 w-5 p-0" : "h-6 w-6 p-0"}
          >
            <RefreshCw className={`${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className={`grid ${compact ? 'grid-cols-6 gap-1' : 'grid-cols-3 gap-2'} flex-1`}>
        {pulses.map((pulse) => {
          const display = EXCHANGE_DISPLAY[pulse.exchange_name] || { name: pulse.exchange_name.slice(0, 3).toUpperCase() };
          return (
            <div
              key={pulse.id}
              className={`${compact ? 'p-1' : 'p-2'} rounded text-center ${
                pulse.status === 'healthy' ? 'bg-green-500/10 border border-green-500/30' :
                pulse.status === 'jitter' ? 'bg-yellow-500/10 border border-yellow-500/30' :
                'bg-red-500/10 border border-red-500/30'
              }`}
            >
              <div className="flex items-center justify-center gap-0.5 mb-0.5">
                {getStatusIcon(pulse.status)}
              </div>
              <p className={`font-medium ${compact ? 'text-[9px]' : 'text-xs'}`}>{display.name}</p>
              <p className={`font-mono ${compact ? 'text-[8px]' : 'text-[10px]'} ${getLatencyColor(pulse.latency_ms, pulse.source)}`}>
                {Math.round(pulse.latency_ms)}ms
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
});

ExchangePulsePanel.displayName = 'ExchangePulsePanel';
