import { useState, useEffect, useRef } from 'react';
import { Brain, TrendingUp, TrendingDown, Minus, RefreshCw, Server, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

interface AIUpdate {
  id: string;
  symbol: string;
  exchange_name: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  insight: string;
  current_price: number;
  price_change_24h: number;
  created_at: string;
  profit_timeframe_minutes?: number;
  recommended_side?: string;
  expected_move_percent?: number;
}

interface AIMarketUpdatesPanelProps {
  fullHeight?: boolean;
  compact?: boolean;
  className?: string;
}

// 10 unique bright flat colors for recommendations
const RECOMMENDATION_COLORS = [
  { bg: 'bg-cyan-500/20', border: 'border-cyan-400/40', text: 'text-cyan-400' },
  { bg: 'bg-pink-500/20', border: 'border-pink-400/40', text: 'text-pink-400' },
  { bg: 'bg-amber-500/20', border: 'border-amber-400/40', text: 'text-amber-400' },
  { bg: 'bg-violet-500/20', border: 'border-violet-400/40', text: 'text-violet-400' },
  { bg: 'bg-emerald-500/20', border: 'border-emerald-400/40', text: 'text-emerald-400' },
  { bg: 'bg-rose-500/20', border: 'border-rose-400/40', text: 'text-rose-400' },
  { bg: 'bg-sky-500/20', border: 'border-sky-400/40', text: 'text-sky-400' },
  { bg: 'bg-orange-500/20', border: 'border-orange-400/40', text: 'text-orange-400' },
  { bg: 'bg-lime-500/20', border: 'border-lime-400/40', text: 'text-lime-400' },
  { bg: 'bg-fuchsia-500/20', border: 'border-fuchsia-400/40', text: 'text-fuchsia-400' }
];

const getSymbolColor = (symbol: string) => {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  return RECOMMENDATION_COLORS[Math.abs(hash) % RECOMMENDATION_COLORS.length];
};

type TimeframeFilter = 'all' | 1 | 3 | 5;

export function AIMarketUpdatesPanel({ fullHeight = false, compact = false, className }: AIMarketUpdatesPanelProps) {
  const [updates, setUpdates] = useState<AIUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [nextScanIn, setNextScanIn] = useState(5);
  const [activeTimeframe, setActiveTimeframe] = useState<TimeframeFilter>('all');
  const hasAutoScanned = useRef(false);
  
  const { vps } = useSystemStatus();
  const isVpsConnected = vps.status === 'running' || vps.status === 'idle';
  const lastUpdate = useAppStore((s) => s.lastUpdate);

  const triggerAutoScan = async () => {
    try {
      const { data: aiConfig } = await supabase
        .from('ai_config')
        .select('is_active')
        .eq('provider', 'groq')
        .single();
      
      if (!aiConfig?.is_active) return;
      
      setScanError(null);
      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { action: 'market-scan' }
      });
      
      if (error || !data?.success) {
        const errMsg = data?.error || error?.message || 'Scan failed';
        setScanError(errMsg);
      } else {
        setLastScanTime(new Date());
      }
    } catch (err) {
      console.error('[AIMarketUpdatesPanel] Auto-scan error:', err);
    }
  };

  useEffect(() => {
    const countdownInterval = setInterval(() => {
      setNextScanIn(prev => (prev > 0 ? prev - 1 : 5));
    }, 1000);
    return () => clearInterval(countdownInterval);
  }, []);

  useEffect(() => {
    const fetchUpdates = async () => {
      try {
        const { data, error } = await supabase
          .from('ai_market_updates')
          .select('*')
          .order('confidence', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        setUpdates((data as AIUpdate[]) || []);
        
        if (!hasAutoScanned.current) {
          hasAutoScanned.current = true;
          triggerAutoScan();
        }
      } catch (err) {
        console.error('[AIMarketUpdatesPanel] Error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUpdates();
  }, [lastUpdate]);

  useEffect(() => {
    const channel = supabase
      .channel('ai-market-realtime-' + Date.now())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ai_market_updates'
      }, (payload) => {
        setUpdates(prev => {
          const newUpdate = payload.new as AIUpdate;
          const filtered = prev.filter(u => 
            !(u.symbol === newUpdate.symbol && u.exchange_name === newUpdate.exchange_name)
          );
          return [newUpdate, ...filtered]
            .sort((a, b) => {
              if (b.confidence !== a.confidence) return b.confidence - a.confidence;
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            })
            .slice(0, 50);
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const scanInterval = setInterval(() => {
      hasAutoScanned.current = false;
      setNextScanIn(5);
      triggerAutoScan();
    }, 5 * 1000);

    return () => clearInterval(scanInterval);
  }, []);

  const triggerManualScan = async () => {
    setIsScanning(true);
    setNextScanIn(5);
    try {
      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { action: 'market-scan' }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`AI analyzed ${data.analyzed || 0} assets via ${data.providersUsed?.join(', ') || 'providers'}`);
        setLastScanTime(new Date());
      } else {
        toast.error(data?.error || 'AI scan failed');
      }
    } catch (err) {
      console.error('[AIMarketUpdatesPanel] Scan error:', err);
      toast.error('Failed to trigger AI scan');
    } finally {
      setIsScanning(false);
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'BULLISH':
        return <TrendingUp className="w-2.5 h-2.5 text-emerald-400" />;
      case 'BEARISH':
        return <TrendingDown className="w-2.5 h-2.5 text-rose-400" />;
      default:
        return <Minus className="w-2.5 h-2.5 text-muted-foreground" />;
    }
  };

  const getTimeframeBadgeClass = (minutes?: number) => {
    switch (minutes) {
      case 1:
        return 'bg-emerald-500/40 text-emerald-300';
      case 3:
        return 'bg-amber-500/40 text-amber-300';
      case 5:
        return 'bg-sky-500/40 text-sky-300';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getSideBadgeClass = (side?: string) => {
    return side === 'short' 
      ? 'bg-rose-500/30 text-rose-300' 
      : 'bg-emerald-500/30 text-emerald-300';
  };

  const getExchangeAbbr = (name: string) => {
    const abbrs: Record<string, string> = {
      binance: 'BIN',
      okx: 'OKX',
      bybit: 'BYB',
      kucoin: 'KUC',
      kraken: 'KRK'
    };
    return abbrs[name?.toLowerCase()] || name?.slice(0, 3).toUpperCase() || '???';
  };

  const sortedUpdates = [...updates].sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const filteredUpdates = activeTimeframe === 'all' 
    ? sortedUpdates 
    : sortedUpdates.filter(u => u.profit_timeframe_minutes === activeTimeframe);

  const binanceUpdates = updates.filter(u => u.exchange_name?.toLowerCase() === 'binance');
  const okxUpdates = updates.filter(u => u.exchange_name?.toLowerCase() === 'okx');

  return (
    <TooltipProvider>
      <div className={cn("card-purple p-2 flex flex-col min-h-0 transition-all duration-300 hover:scale-[1.005]", fullHeight && "h-full", className)}>
        {/* Header */}
        <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="p-1 rounded-md bg-purple-500/20 animate-glow-pulse">
              <Brain className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-xs text-purple-300">AI Market Analysis</h3>
              <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE
                </span>
                <span className="flex items-center gap-0.5 font-mono text-amber-400">
                  <Zap className="w-2 h-2" />
                  {nextScanIn}s
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-0.5 mr-1">
              {(['all', 1, 3, 5] as TimeframeFilter[]).map(tf => (
                <Tooltip key={tf}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setActiveTimeframe(tf)}
                      className={cn(
                        "px-1.5 py-0.5 text-[8px] font-medium rounded transition-all duration-300",
                        activeTimeframe === tf 
                          ? "bg-purple-500 text-white" 
                          : "bg-secondary/50 text-muted-foreground hover:bg-purple-500/30"
                      )}
                    >
                      {tf === 'all' ? 'ALL' : `${tf}m`}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{tf === 'all' ? 'Show all timeframes' : `Filter ${tf} minute profit window`}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] transition-all duration-300",
                  isVpsConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-secondary/50 text-muted-foreground'
                )}>
                  <Server className="w-2.5 h-2.5" />
                  {isVpsConnected ? 'VPS' : 'Off'}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isVpsConnected ? 'VPS connected - faster analysis' : 'VPS offline'}</p>
              </TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={triggerManualScan}
                  disabled={isScanning}
                  className="h-5 px-1.5 text-[9px] gap-0.5 border-purple-400/30 hover:border-purple-400 hover:bg-purple-500/20 transition-all duration-300"
                >
                  <RefreshCw className={cn("w-2.5 h-2.5", isScanning && "animate-spin")} />
                  Scan
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Trigger manual AI market scan</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {scanError && (
          <div className="text-[9px] text-rose-400 bg-rose-500/10 p-1 rounded mb-1 flex-shrink-0 animate-fade-slide-in border border-rose-400/20">
            {scanError}
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5 scrollbar-thin">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
              <Brain className="w-4 h-4 animate-pulse mr-1" />
              Loading...
            </div>
          ) : filteredUpdates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1">
              <Brain className="w-8 h-8 opacity-30" />
              <p className="text-[10px]">No AI insights yet</p>
              <p className="text-[9px]">Connect exchange + enable AI</p>
            </div>
          ) : (
            filteredUpdates.map((update, index) => {
              const symbolColor = getSymbolColor(update.symbol);
              const isHighConfidence = update.confidence >= 80;
              
              return (
                <div 
                  key={update.id} 
                  className={cn(
                    "px-1.5 py-1 rounded border flex items-center gap-1.5 transition-all duration-300 animate-fade-slide-in",
                    symbolColor.bg,
                    symbolColor.border,
                    isHighConfidence && "ring-1 ring-emerald-400/40 shadow-[0_0_6px_rgba(52,211,153,0.2)]"
                  )}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <span className="text-[8px] text-muted-foreground w-10 shrink-0 font-mono">
                    {format(new Date(update.created_at), 'HH:mm:ss')}
                  </span>
                  
                  {update.profit_timeframe_minutes && (
                    <span className={cn(
                      "text-[7px] px-1 py-0 rounded font-bold shrink-0",
                      getTimeframeBadgeClass(update.profit_timeframe_minutes)
                    )}>
                      {update.profit_timeframe_minutes}m
                    </span>
                  )}
                  
                  <span className="text-[7px] px-0.5 rounded bg-secondary/50 text-muted-foreground shrink-0">
                    {getExchangeAbbr(update.exchange_name)}
                  </span>
                  
                  <span className={cn("text-[10px] font-bold w-8 shrink-0", symbolColor.text)}>
                    {update.symbol}
                  </span>
                  
                  <span className="text-[9px] w-14 shrink-0">
                    ${update.current_price?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '—'}
                  </span>
                  
                  {update.price_change_24h !== null && (
                    <span className={cn(
                      "text-[8px] w-9 shrink-0 transition-colors duration-300",
                      update.price_change_24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    )}>
                      {update.price_change_24h >= 0 ? '+' : ''}{update.price_change_24h.toFixed(1)}%
                    </span>
                  )}
                  
                  <span className={cn(
                    "text-[8px] font-bold w-6 shrink-0 transition-colors duration-300",
                    update.confidence >= 80 ? 'text-emerald-400' : 
                    update.confidence >= 60 ? 'text-amber-400' : 'text-muted-foreground'
                  )}>
                    {update.confidence}%
                  </span>
                  
                  {update.recommended_side && (
                    <span className={cn(
                      "text-[7px] px-1 rounded font-medium shrink-0",
                      getSideBadgeClass(update.recommended_side)
                    )}>
                      {update.recommended_side === 'short' ? 'SHORT' : 'LONG'}
                    </span>
                  )}
                  
                  <span className="shrink-0">
                    {getSentimentIcon(update.sentiment)}
                  </span>
                  
                  <span className="text-[8px] text-muted-foreground flex-1 truncate min-w-0">
                    {update.insight}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Stats */}
        <div className="mt-1 pt-1 border-t border-purple-400/20 flex items-center justify-between text-[9px] text-muted-foreground flex-shrink-0">
          <span className="text-purple-300">{filteredUpdates.length} of {updates.length} insights</span>
          <span>BIN: {binanceUpdates.length} | OKX: {okxUpdates.length}</span>
          {lastScanTime && (
            <span>Last: {format(lastScanTime, 'HH:mm')}</span>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
