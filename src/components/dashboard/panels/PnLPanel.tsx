import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, Wifi } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useExchangeWebSocket } from '@/hooks/useExchangeWebSocket';
import { supabase } from '@/integrations/supabase/client';

interface PortfolioSnapshot {
  daily_pnl: number | null;
  weekly_pnl: number | null;
  total_balance: number;
}

export function PnLPanel() {
  const { totalBalance, exchanges, isLive, isLoading: exchangeLoading } = useExchangeWebSocket();
  const [pnlData, setPnlData] = useState<PortfolioSnapshot | null>(null);
  const [activeTrades, setActiveTrades] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const connectedCount = exchanges.length;

  useEffect(() => {
    const fetchPnLData = async () => {
      try {
        // Fetch latest portfolio snapshot for PnL data
        const { data: snapshot } = await supabase
          .from('portfolio_snapshots')
          .select('daily_pnl, weekly_pnl, total_balance')
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
      } catch (err) {
        console.error('[PnLPanel] Error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPnLData();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('pnl-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'portfolio_snapshots'
      }, () => fetchPnLData())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trading_journal'
      }, () => fetchPnLData())
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
    <>
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Today's P&L</span>
          <DollarSign className="w-4 h-4 text-success" />
        </div>
        {isDataLoading ? (
          <>
            <Skeleton className="h-8 w-28 mb-1" />
            <Skeleton className="h-4 w-16" />
          </>
        ) : (
          <>
            <p className={`text-2xl font-bold ${dailyPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
              {dailyPnl >= 0 ? '+' : ''}${dailyPnl.toFixed(2)}
            </p>
            <div className="flex items-center gap-1 mt-1">
              {dailyPnl >= 0 ? (
                <TrendingUp className="w-3 h-3 text-success" />
              ) : (
                <TrendingDown className="w-3 h-3 text-destructive" />
              )}
              <span className={`text-xs ${dailyPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                {dailyPnl >= 0 ? '+' : ''}{dailyPercent.toFixed(2)}%
              </span>
            </div>
          </>
        )}
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Weekly P&L</span>
          <DollarSign className="w-4 h-4 text-success" />
        </div>
        {isDataLoading ? (
          <>
            <Skeleton className="h-8 w-28 mb-1" />
            <Skeleton className="h-4 w-16" />
          </>
        ) : (
          <>
            <p className={`text-2xl font-bold ${weeklyPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
              {weeklyPnl >= 0 ? '+' : ''}${weeklyPnl.toFixed(2)}
            </p>
            <div className="flex items-center gap-1 mt-1">
              {weeklyPnl >= 0 ? (
                <TrendingUp className="w-3 h-3 text-success" />
              ) : (
                <TrendingDown className="w-3 h-3 text-destructive" />
              )}
              <span className={`text-xs ${weeklyPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                {weeklyPnl >= 0 ? '+' : ''}{weeklyPercent.toFixed(2)}%
              </span>
            </div>
          </>
        )}
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Total Equity</span>
            {isLive && (
              <span className="flex items-center gap-1 text-xs text-success bg-success/10 px-1.5 py-0.5 rounded-full">
                <Wifi className="w-3 h-3" />
                LIVE
              </span>
            )}
          </div>
          <DollarSign className="w-4 h-4 text-primary" />
        </div>
        {exchangeLoading ? (
          <>
            <Skeleton className="h-8 w-32 mb-1" />
            <Skeleton className="h-4 w-24" />
          </>
        ) : (
          <>
            <p className="text-2xl font-bold">
              ${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs text-muted-foreground">
                Across {connectedCount} exchange{connectedCount !== 1 ? 's' : ''}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Active Trades</span>
          <Activity className="w-4 h-4 text-accent" />
        </div>
        {isLoading ? (
          <>
            <Skeleton className="h-8 w-12 mb-1" />
            <Skeleton className="h-4 w-20" />
          </>
        ) : (
          <>
            <p className="text-2xl font-bold">{activeTrades}</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs text-muted-foreground">
                {activeTrades > 0 ? 'Positions open' : 'No open positions'}
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
