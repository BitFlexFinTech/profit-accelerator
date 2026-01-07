import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, Brain, Wifi } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useExchangeWebSocket } from '@/hooks/useExchangeWebSocket';
import { supabase } from '@/integrations/supabase/client';

interface PortfolioSnapshot {
  daily_pnl: number | null;
  weekly_pnl: number | null;
}

export function CompactMetricsBar() {
  const { totalBalance, exchanges, isLive, isLoading: exchangeLoading } = useExchangeWebSocket();
  const [pnlData, setPnlData] = useState<PortfolioSnapshot | null>(null);
  const [activeTrades, setActiveTrades] = useState(0);
  const [latestAI, setLatestAI] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch latest portfolio snapshot for PnL data
        const { data: snapshot } = await supabase
          .from('portfolio_snapshots')
          .select('daily_pnl, weekly_pnl')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (snapshot) {
          setPnlData(snapshot as PortfolioSnapshot);
        }

        // Fetch active trades count
        const { data: trades } = await supabase
          .from('trading_journal')
          .select('status')
          .eq('status', 'open');

        setActiveTrades(trades?.length || 0);

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
        setIsLoading(false);
      }
    };

    fetchData();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('compact-metrics-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'portfolio_snapshots'
      }, () => fetchData())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trading_journal'
      }, () => fetchData())
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

  const dailyPnl = pnlData?.daily_pnl || 0;
  const weeklyPnl = pnlData?.weekly_pnl || 0;
  const dailyPercent = totalBalance > 0 ? (dailyPnl / totalBalance) * 100 : 0;
  const weeklyPercent = totalBalance > 0 ? (weeklyPnl / totalBalance) * 100 : 0;
  const isDataLoading = isLoading || exchangeLoading;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
      {/* Today's P&L */}
      <div className="glass-card p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Today</span>
          <DollarSign className="w-3 h-3 text-success" />
        </div>
        {isDataLoading ? (
          <Skeleton className="h-6 w-20" />
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
        {isDataLoading ? (
          <Skeleton className="h-6 w-20" />
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
        {exchangeLoading ? (
          <Skeleton className="h-6 w-24" />
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold">
              ${totalBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span className="text-[10px] text-muted-foreground">
              ({exchanges.length}ex)
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
        {isLoading ? (
          <Skeleton className="h-6 w-12" />
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold">{activeTrades}</span>
            <span className="text-[10px] text-muted-foreground">
              {activeTrades > 0 ? 'open' : 'none'}
            </span>
          </div>
        )}
      </div>

      {/* AI Insight Strip */}
      <div className="glass-card p-3 col-span-2 md:col-span-1">
        <div className="flex items-center gap-1.5">
          <Brain className="w-4 h-4 text-purple-400 flex-shrink-0" />
          {isLoading ? (
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