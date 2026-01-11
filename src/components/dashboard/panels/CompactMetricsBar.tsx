import { TrendingUp, TrendingDown, DollarSign, Activity, Brain, Wifi, AlertCircle, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore } from '@/store/useAppStore';
import { useTradesRealtime } from '@/hooks/useTradesRealtime';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function CompactMetricsBar() {
  // Use SSOT store for equity - single source of truth
  const { 
    getTotalEquity, 
    getConnectedExchangeCount, 
    dailyPnl, 
    weeklyPnl, 
    isLoading: storeLoading,
    lastUpdate
  } = useAppStore();
  
  // Use unified trades hook - single source of truth for trade data
  const { totalTrades, openCount, loading: tradesLoading } = useTradesRealtime();
  
  const totalBalance = getTotalEquity();
  const exchangeCount = getConnectedExchangeCount();
  const isLive = lastUpdate > Date.now() - 60000; // Consider live if updated in last minute
  
  // CRITICAL FIX: Cache last known good values to prevent "Not Connected" flash on tab switch
  const cachedValues = useRef({
    totalBalance: 0,
    dailyPnl: 0,
    weeklyPnl: 0,
    lastUpdated: 0
  });
  
  // Update cache when real data arrives
  useEffect(() => {
    if (totalBalance > 0 || dailyPnl !== 0 || weeklyPnl !== 0) {
      cachedValues.current = {
        totalBalance,
        dailyPnl,
        weeklyPnl,
        lastUpdated: Date.now()
      };
    }
  }, [totalBalance, dailyPnl, weeklyPnl]);
  
  // Use cached values during loading to prevent "Not Connected" flash
  const displayBalance = totalBalance > 0 ? totalBalance : cachedValues.current.totalBalance;
  const displayDailyPnl = totalBalance > 0 ? dailyPnl : cachedValues.current.dailyPnl;
  const displayWeeklyPnl = totalBalance > 0 ? weeklyPnl : cachedValues.current.weeklyPnl;
  
  // Calculate data freshness
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const secondsAgo = Math.max(0, Math.floor((now - lastUpdate) / 1000));
  const isStale = secondsAgo > 120; // Stale if > 2 minutes
  
  const [latestAI, setLatestAI] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(true);

  useEffect(() => {
    const fetchAI = async () => {
      try {
        // Fetch latest AI insight
        const { data: aiUpdate } = await supabase
          .from('ai_market_updates')
          .select('symbol, sentiment, confidence')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (aiUpdate) {
          setLatestAI(`${aiUpdate.symbol} ${aiUpdate.sentiment} ${aiUpdate.confidence}%`);
        }
      } catch (err) {
        console.error('[CompactMetricsBar] AI fetch error:', err);
      } finally {
        setAiLoading(false);
      }
    };

    fetchAI();

    // Subscribe to AI updates only
    const channel = supabase
      .channel('compact-metrics-ai')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ai_market_updates'
      }, (payload) => {
        const newUpdate = payload.new as { symbol: string; sentiment: string; confidence: number };
        setLatestAI(`${newUpdate.symbol} ${newUpdate.sentiment} ${newUpdate.confidence}%`);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const dailyPercent = displayBalance > 0 ? (displayDailyPnl / displayBalance) * 100 : 0;
  const weeklyPercent = displayBalance > 0 ? (displayWeeklyPnl / displayBalance) * 100 : 0;
  
  // CRITICAL FIX: Only show "Not Connected" if we have NO cached data AND not loading
  const hasNoData = displayBalance === 0 && !storeLoading && cachedValues.current.lastUpdated === 0;
  const localLoading = tradesLoading || aiLoading;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn(
        "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2",
        isStale && "ring-1 ring-warning/30 rounded-lg"
      )}>
        {/* Today's P&L */}
        <div className="glass-card p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Today</span>
            <DollarSign className="w-3 h-3 text-success" />
          </div>
          {storeLoading ? (
            <Skeleton className="h-6 w-20" />
          ) : hasNoData ? (
            <div className="flex items-center gap-1 text-muted-foreground">
              <AlertCircle className="w-3 h-3" />
              <span className="text-xs">Not Connected</span>
            </div>
          ) : displayDailyPnl === 0 && openCount === 0 ? (
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold text-muted-foreground">$0</span>
              <span className="text-[10px] text-muted-foreground">No trades</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className={`text-lg font-bold ${displayDailyPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                {displayDailyPnl >= 0 ? '+' : ''}${Math.abs(displayDailyPnl).toFixed(0)}
              </span>
              <span className={`text-[10px] ${displayDailyPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                ({dailyPercent >= 0 ? '+' : ''}{dailyPercent.toFixed(1)}%)
              </span>
            </div>
          )}
        </div>

        {/* Weekly P&L */}
        <div className="glass-card p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Week</span>
            {displayWeeklyPnl >= 0 ? (
              <TrendingUp className="w-3 h-3 text-success" />
            ) : (
              <TrendingDown className="w-3 h-3 text-destructive" />
            )}
          </div>
          {storeLoading ? (
            <Skeleton className="h-6 w-20" />
          ) : hasNoData ? (
            <div className="flex items-center gap-1 text-muted-foreground">
              <AlertCircle className="w-3 h-3" />
              <span className="text-xs">Not Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className={`text-lg font-bold ${displayWeeklyPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                {displayWeeklyPnl >= 0 ? '+' : ''}${Math.abs(displayWeeklyPnl).toFixed(0)}
              </span>
              <span className={`text-[10px] ${displayWeeklyPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                ({weeklyPercent >= 0 ? '+' : ''}{weeklyPercent.toFixed(1)}%)
              </span>
            </div>
          )}
        </div>

        {/* Total Equity */}
        <div className="glass-card p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Equity</span>
              {isLive && (
                <Wifi className="w-2.5 h-2.5 text-success" />
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "flex items-center gap-0.5 cursor-help",
                  isStale ? "text-warning" : "text-muted-foreground"
                )}>
                  <Clock className="w-2.5 h-2.5" />
                  <span className="text-[9px]">
                    {secondsAgo < 60 ? `${secondsAgo}s` : `${Math.floor(secondsAgo / 60)}m`}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {isStale ? `Data is stale (last update ${secondsAgo}s ago)` : `Last updated ${secondsAgo}s ago`}
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          {storeLoading ? (
            <Skeleton className="h-6 w-24" />
          ) : hasNoData ? (
            <div className="flex items-center gap-1 text-muted-foreground">
              <AlertCircle className="w-3 h-3" />
              <span className="text-xs">Connect Exchange</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold">
                ${displayBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({exchangeCount}ex)
              </span>
            </div>
          )}
        </div>

        {/* Active Trades */}
        <div className="glass-card p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Trades</span>
            <Activity className="w-3 h-3 text-accent" />
          </div>
          {localLoading ? (
            <Skeleton className="h-6 w-12" />
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold">{totalTrades}</span>
              <span className="text-[10px] text-muted-foreground">
                ({openCount} open)
              </span>
            </div>
          )}
        </div>

        {/* AI Insight Strip */}
        <div className="glass-card p-3 col-span-2 md:col-span-1">
          <div className="flex items-center gap-1.5">
            <Brain className="w-4 h-4 text-purple-400 flex-shrink-0" />
            {localLoading ? (
              <Skeleton className="h-5 w-full" />
            ) : latestAI ? (
              <span className="text-xs truncate">
                🔮 {latestAI}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground truncate">
                AI analyzing...
              </span>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
