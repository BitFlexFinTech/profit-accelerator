import { useState, useEffect, forwardRef, useCallback } from 'react';
import { Activity, CheckCircle2, XCircle, RefreshCw, Server, AlertTriangle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { differenceInSeconds } from 'date-fns';
import { StatusDot, StatusDotColor } from '@/components/ui/StatusDot';

interface ExchangePulse {
  id: string;
  exchange_name: string;
  status: 'healthy' | 'jitter' | 'error';
  latency_ms: number;
  source?: 'edge' | 'vps';
  last_check?: string;
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
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());
  const lastUpdate = useAppStore((s) => s.lastUpdate);

  // Update "now" every second for freshness display
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Normalize exchange name for matching (handles case, spaces, dots)
  const normalizeExchangeName = (name: string) => name.toLowerCase().replace(/[\s.\-]/g, '');

  const fetchPulses = useCallback(async () => {
    try {
      // ITEM 2: Get ONLY connected exchanges - filter out disconnected
      const { data: connections } = await supabase
        .from('exchange_connections')
        .select('exchange_name')
        .eq('is_connected', true);
      
      if (!connections || connections.length === 0) {
        setPulses([]);
        return;
      }
      
      // Build set of normalized connected exchange names
      const connectedNamesSet = new Set(connections.map(c => normalizeExchangeName(c.exchange_name)));
      
      const { data, error } = await supabase
        .from('exchange_pulse')
        .select('id, exchange_name, status, latency_ms, source, last_check')
        .order('exchange_name');

      if (error) throw error;
      
      // ITEM 2: FILTER to only show connected exchanges (removes Bybit etc.)
      const connectedPulses = (data || []).filter(pulse => 
        connectedNamesSet.has(normalizeExchangeName(pulse.exchange_name))
      );
      
      // Sort alphabetically and limit
      const sorted = connectedPulses
        .sort((a, b) => a.exchange_name.localeCompare(b.exchange_name))
        .slice(0, 6);
      
      setPulses(sorted as ExchangePulse[]);
      
      // Extract the latest check time
      if (sorted.length > 0 && sorted[0].last_check) {
        setLastCheckTime(new Date(sorted[0].last_check));
      }
    } catch (err) {
      console.error('[ExchangePulsePanel] Error:', err);
    }
  }, []);

  // Use SSOT lastUpdate to trigger refetch
  useEffect(() => {
    fetchPulses();
  }, [fetchPulses, lastUpdate]);

  // Auto-refresh latency every 10 seconds (STRICT RULE)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPulses();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchPulses]);

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
    if (latency < threshold) return 'text-emerald-400';
    if (latency < threshold * 3) return 'text-amber-400';
    return 'text-rose-400';
  };

  // ITEMS 3 & 4: Connected exchanges ALWAYS get green dot (success)
  // Since we now only show connected exchanges (filtered in fetchPulses),
  // all displayed exchanges are connected and should show green
  const getStatusDotColor = (): StatusDotColor => {
    // All displayed pulses are connected (filtered above), so always green
    return 'success';
  };

  const getStatusBg = (status: string) => {
    if (status === 'healthy') return 'bg-emerald-500/10 border-emerald-500/30';
    if (status === 'jitter') return 'bg-amber-500/10 border-amber-500/30';
    return 'bg-rose-500/10 border-rose-500/30';
  };

  const healthyCount = pulses.filter(p => p.status === 'healthy').length;
  const isVPS = pulses.some(p => p.source === 'vps');
  
  // Calculate data freshness
  const getSecondsAgo = () => {
    if (!lastCheckTime) return null;
    return Math.max(0, differenceInSeconds(now, lastCheckTime));
  };
  
  const secondsAgo = getSecondsAgo();
  const isStale = secondsAgo !== null && secondsAgo > 120; // Stale if > 2 minutes

  return (
    <TooltipProvider delayDuration={200}>
    <div ref={ref} className={cn("glass-card h-full flex flex-col", compact ? 'p-2' : 'p-4')}>
      <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Activity className={cn(
            "text-primary animate-blink",
            compact ? 'w-3 h-3' : 'w-4 h-4'
          )} />
          <span className={cn("font-medium", compact ? 'text-xs' : 'text-sm')}>Exchange Pulse</span>
          {isVPS && (
            <span className="flex items-center gap-0.5 text-[9px] text-emerald-400 bg-emerald-500/10 px-1 rounded animate-blink">
              <Server className="w-2 h-2" />VPS
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">{healthyCount}/{pulses.length}</span>
          
          {/* Freshness indicator with tooltip */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn(
                "flex items-center gap-0.5 text-[9px] px-1 rounded cursor-help",
                isStale ? "text-amber-400 bg-amber-500/10" : "text-muted-foreground bg-secondary/50"
              )}>
                <Clock className="w-2 h-2" />
                {secondsAgo !== null ? (secondsAgo < 60 ? `${secondsAgo}s` : `${Math.floor(secondsAgo / 60)}m`) : '—'}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">
                {isStale 
                  ? `Data is stale (${secondsAgo}s ago) - click refresh` 
                  : `Last ping: ${secondsAgo}s ago`}
              </p>
            </TooltipContent>
          </Tooltip>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshPulses}
            disabled={isRefreshing}
            className={cn("transition-all duration-300", compact ? "h-5 w-5 p-0" : "h-6 w-6 p-0")}
          >
            <RefreshCw className={cn(
              compact ? 'w-2.5 h-2.5' : 'w-3 h-3',
              isRefreshing && 'animate-spin'
            )} />
          </Button>
        </div>
      </div>

      <div className={cn(
        "grid flex-1",
        compact ? 'grid-cols-6 gap-1' : 'grid-cols-3 gap-2'
      )}>
        {pulses.map((pulse, index) => {
          const display = EXCHANGE_DISPLAY[pulse.exchange_name] || { name: pulse.exchange_name.slice(0, 3).toUpperCase() };
          return (
            <div
              key={pulse.id}
              className={cn(
                "rounded text-center border transition-all duration-300 animate-fade-slide-in",
                compact ? 'p-1' : 'p-2',
                getStatusBg(pulse.status)
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-center justify-center gap-0.5 mb-0.5">
                <StatusDot 
                  color={getStatusDotColor()} 
                  pulse={true} 
                  size={compact ? 'xs' : 'sm'} 
                />
              </div>
              <p className={cn("font-medium", compact ? 'text-[9px]' : 'text-xs')}>{display.name}</p>
              <p className={cn(
                "font-mono transition-colors duration-300",
                compact ? 'text-[8px]' : 'text-[10px]',
                getLatencyColor(pulse.latency_ms, pulse.source)
              )}>
                {pulse.source === 'vps' ? 'VPS→' : ''}{Math.round(pulse.latency_ms)}ms
              </p>
            </div>
          );
        })}
      </div>
    </div>
    </TooltipProvider>
  );
});

ExchangePulsePanel.displayName = 'ExchangePulsePanel';