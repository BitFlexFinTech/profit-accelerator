import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, Brain, Wifi, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/integrations/supabase/client';

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
  
  const totalBalance = getTotalEquity();
  const exchangeCount = getConnectedExchangeCount();
  const isLive = lastUpdate > Date.now() - 60000; // Consider live if updated in last minute
  
  const [activeTrades, setActiveTrades] = useState(0);
  const [totalTrades, setTotalTrades] = useState(0);
  const [latestAI, setLatestAI] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(true);

  useEffect(() => {
    // NO syncFromDatabase() call here - store initializes itself via initializeAppStore()
    // This prevents duplicate fetches and flickering
    
    const fetchLocalData = async () => {
      try {
        // STRICT RULE: Fetch ALL trades, not just open
        const { data: trades } = await supabase
          .from('trading_journal')
          .select('status');

        const openCount = trades?.filter(t => t.status === 'open').length || 0;
        const totalCount = trades?.length || 0;
        setActiveTrades(openCount);
        setTotalTrades(totalCount);

        // Fetch latest AI insight
        const { data: aiUpdate } = await supabase
          .from('ai_market_updates')
          .select('symbol, sentiment, confidence')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (aiUpdate) {
          setLatestAI(`${aiUpdate.symbol} ${aiUpdate.sentiment} ${aiUpdate.confidence}%`);
        }
      } catch (err) {
        console.error('[CompactMetricsBar] Error:', err);
      } finally {
        setLocalLoading(false);
      }
    };

    fetchLocalData();

    // Subscribe to realtime updates for LOCAL data only (trades, AI)
    const channel = supabase
      .channel('compact-metrics-local')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trading_journal'
      }, () => fetchLocalData())
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

  const dailyPercent = totalBalance > 0 ? (dailyPnl / totalBalance) * 100 : 0;
  const weeklyPercent = totalBalance > 0 ? (weeklyPnl / totalBalance) * 100 : 0;
  const hasNoData = totalBalance === 0 && !storeLoading;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
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
        ) : dailyPnl === 0 && activeTrades === 0 ? (
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold text-muted-foreground">$0</span>
            <span className="text-[10px] text-muted-foreground">No trades</span>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span className={`text-lg font-bold ${dailyPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
              {dailyPnl >= 0 ? '+' : ''}${Math.abs(dailyPnl).toFixed(0)}
            </span>
            <span className={`text-[10px] ${dailyPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
              ({dailyPercent >= 0 ? '+' : ''}{dailyPercent.toFixed(1)}%)
            </span>
          </div>
        )}
      </div>

      {/* Weekly P&L */}
      <div className="glass-card p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Week</span>
          {weeklyPnl >= 0 ? (
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
            <span className={`text-lg font-bold ${weeklyPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
              {weeklyPnl >= 0 ? '+' : ''}${Math.abs(weeklyPnl).toFixed(0)}
            </span>
            <span className={`text-[10px] ${weeklyPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
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
          <DollarSign className="w-3 h-3 text-primary" />
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
              ${totalBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
              ({activeTrades} open)
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
  );
}