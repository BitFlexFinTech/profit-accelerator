import { useState, useEffect, useRef } from 'react';
import { Brain, TrendingUp, TrendingDown, Minus, RefreshCw, Server, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
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
  { bg: 'bg-cyan-500/20', border: 'border-cyan-400', text: 'text-cyan-400' },
  { bg: 'bg-pink-500/20', border: 'border-pink-400', text: 'text-pink-400' },
  { bg: 'bg-amber-500/20', border: 'border-amber-400', text: 'text-amber-400' },
  { bg: 'bg-violet-500/20', border: 'border-violet-400', text: 'text-violet-400' },
  { bg: 'bg-emerald-500/20', border: 'border-emerald-400', text: 'text-emerald-400' },
  { bg: 'bg-rose-500/20', border: 'border-rose-400', text: 'text-rose-400' },
  { bg: 'bg-sky-500/20', border: 'border-sky-400', text: 'text-sky-400' },
  { bg: 'bg-orange-500/20', border: 'border-orange-400', text: 'text-orange-400' },
  { bg: 'bg-lime-500/20', border: 'border-lime-400', text: 'text-lime-400' },
  { bg: 'bg-fuchsia-500/20', border: 'border-fuchsia-400', text: 'text-fuchsia-400' }
];

// Get color based on symbol hash for consistency
const getSymbolColor = (symbol: string) => {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  return RECOMMENDATION_COLORS[Math.abs(hash) % RECOMMENDATION_COLORS.length];
};

export function AIMarketUpdatesPanel({ fullHeight = false, compact = false, className }: AIMarketUpdatesPanelProps) {
  const [updates, setUpdates] = useState<AIUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [nextScanIn, setNextScanIn] = useState(5);
  const hasAutoScanned = useRef(false);
  
  const { vps } = useSystemStatus();
  const isVpsConnected = vps.status === 'running' || vps.status === 'idle';
  
  // Use SSOT lastUpdate to trigger refetch
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

  // Countdown timer - 5 second intervals (STRICT RULE)
  useEffect(() => {
    const countdownInterval = setInterval(() => {
      setNextScanIn(prev => (prev > 0 ? prev - 1 : 5));
    }, 1000);
    return () => clearInterval(countdownInterval);
  }, []);

  // Fetch updates on mount and when SSOT updates
  useEffect(() => {
    const fetchUpdates = async () => {
      try {
        const { data, error } = await supabase
          .from('ai_market_updates')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(30);

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

  // Auto-scan every 5 seconds (STRICT RULE)
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
        toast.success(`AI analyzed ${data.analyzed || 0} assets`);
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
        return <TrendingUp className="w-3 h-3 text-emerald-400" />;
      case 'BEARISH':
        return <TrendingDown className="w-3 h-3 text-rose-400" />;
      default:
        return <Minus className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const getSentimentClass = (sentiment: string) => {
    switch (sentiment) {
      case 'BULLISH':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'BEARISH':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      default:
        return 'bg-secondary text-muted-foreground';
    }
  };

  const getTimeframeClass = (minutes?: number) => {
    switch (minutes) {
      case 1:
        return 'bg-emerald-500/30 text-emerald-300 border-emerald-400/50';
      case 3:
        return 'bg-amber-500/30 text-amber-300 border-amber-400/50';
      case 5:
        return 'bg-sky-500/30 text-sky-300 border-sky-400/50';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const binanceUpdates = updates.filter(u => u.exchange_name?.toLowerCase() === 'binance');
  const okxUpdates = updates.filter(u => u.exchange_name?.toLowerCase() === 'okx');

  return (
    <div className={cn("glass-card p-3 flex flex-col min-h-0", fullHeight && "h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/20">
            <Brain className="w-4 h-4 text-purple-400 animate-blink" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">AI Market Analysis</h3>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-blink" />
                5s scan
              </span>
              <span className="flex items-center gap-1">
                <Zap className="w-2.5 h-2.5 text-amber-400 animate-blink" />
                {nextScanIn}s
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn(
            "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-all duration-300",
            isVpsConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-secondary/50 text-muted-foreground'
          )}>
            <Server className="w-3 h-3 animate-blink" />
            {isVpsConnected ? 'VPS' : 'Off'}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={triggerManualScan}
            disabled={isScanning}
            className="h-6 px-2 text-xs gap-1 transition-all duration-300"
          >
            <RefreshCw className={cn("w-3 h-3", isScanning && "animate-spin")} />
            Scan
          </Button>
        </div>
      </div>

      {/* Error Display */}
      {scanError && (
        <div className="text-[10px] text-rose-400 bg-rose-500/10 p-1.5 rounded mb-2 flex-shrink-0 animate-fade-slide-in">
          {scanError}
        </div>
      )}

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Brain className="w-6 h-6 animate-blink mr-2" />
            Loading...
          </div>
        ) : updates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Brain className="w-10 h-10 opacity-30" />
            <p className="text-xs">No AI insights yet</p>
            <p className="text-[10px]">Connect exchange + enable Groq AI</p>
          </div>
        ) : (
          updates.map((update, index) => {
            const symbolColor = getSymbolColor(update.symbol);
            return (
              <div 
                key={update.id} 
                className={cn(
                  "p-2 rounded-lg border transition-all duration-300 animate-fade-slide-in",
                  symbolColor.bg,
                  symbolColor.border
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(update.created_at), 'HH:mm:ss')}
                  </span>
                  <span className={cn(
                    "text-[9px] px-1 py-0 rounded border",
                    symbolColor.border,
                    symbolColor.text
                  )}>
                    {update.exchange_name?.toUpperCase()}
                  </span>
                  <span className={cn("font-bold text-xs", symbolColor.text)}>
                    {update.symbol}
                  </span>
                  <span className="text-xs">
                    ${update.current_price?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '—'}
                  </span>
                  {update.price_change_24h !== null && (
                    <span className={cn(
                      "text-xs transition-colors duration-300",
                      update.price_change_24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    )}>
                      {update.price_change_24h >= 0 ? '+' : ''}{update.price_change_24h.toFixed(2)}%
                    </span>
                  )}
                  
                  {/* Profit Timeframe Badge */}
                  {update.profit_timeframe_minutes && (
                    <span className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded-full border font-medium animate-blink",
                      getTimeframeClass(update.profit_timeframe_minutes)
                    )}>
                      {update.profit_timeframe_minutes}m
                    </span>
                  )}
                  
                  <div className={cn(
                    "ml-auto px-1.5 py-0.5 rounded flex items-center gap-1 transition-all duration-300",
                    getSentimentClass(update.sentiment)
                  )}>
                    {getSentimentIcon(update.sentiment)}
                    <span className="text-[10px] font-medium">{update.sentiment}</span>
                  </div>
                </div>
                
                {/* Confidence Bar */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-muted-foreground">Conf:</span>
                  <Progress value={update.confidence} className="h-1 flex-1" />
                  <span className={cn(
                    "text-[10px] font-medium transition-colors duration-300",
                    update.confidence >= 70 ? 'text-emerald-400' : 
                    update.confidence >= 50 ? 'text-amber-400' : 'text-muted-foreground'
                  )}>
                    {update.confidence}%
                  </span>
                </div>

                {/* Insight */}
                <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
                  {update.insight}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Stats */}
      <div className="mt-1.5 pt-1.5 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground flex-shrink-0">
        <span>{updates.length} insights</span>
        <span>Binance: {binanceUpdates.length} | OKX: {okxUpdates.length}</span>
        {lastScanTime && (
          <span>Last: {format(lastScanTime, 'HH:mm')}</span>
        )}
      </div>
    </div>
  );
}