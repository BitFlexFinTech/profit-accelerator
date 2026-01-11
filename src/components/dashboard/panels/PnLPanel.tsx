import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, Wifi } from 'lucide-react';
import { StatusDot } from '@/components/ui/StatusDot';
import { Skeleton } from '@/components/ui/skeleton';
import { useExchangeWebSocket } from '@/hooks/useExchangeWebSocket';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store/useAppStore';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function PnLPanel() {
  const { totalBalance, exchanges, isLive, isLoading: exchangeLoading } = useExchangeWebSocket();
  const dailyPnl = useAppStore((s) => s.dailyPnl);
  const weeklyPnl = useAppStore((s) => s.weeklyPnl);
  const lastUpdate = useAppStore((s) => s.lastUpdate);
  const isStoreLoading = useAppStore((s) => s.isLoading);
  const [activeTrades, setActiveTrades] = useState(0);
  const connectedCount = exchanges.length;

  // Fetch active trades count - uses SSOT lastUpdate trigger
  const fetchActiveTrades = useCallback(async () => {
    try {
      const { data: trades } = await supabase
        .from('trading_journal')
        .select('status')
        .eq('status', 'open');
      setActiveTrades(trades?.length || 0);
    } catch (err) {
      console.error('[PnLPanel] Error:', err);
    }
  }, []);

  useEffect(() => {
    fetchActiveTrades();
  }, [fetchActiveTrades, lastUpdate]);

  const dailyPercent = totalBalance > 0 ? (dailyPnl / totalBalance) * 100 : 0;
  const weeklyPercent = totalBalance > 0 ? (weeklyPnl / totalBalance) * 100 : 0;

  const isDataLoading = isStoreLoading || exchangeLoading;

  return (
    <TooltipProvider delayDuration={200}>
      {/* Today's P&L - Green Card */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="glass-card card-green p-4 group cursor-default">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Today's P&L</span>
              <div className="icon-container-green p-1.5 rounded-md">
                <DollarSign className="w-4 h-4 text-green-accent" />
              </div>
            </div>
            {isDataLoading ? (
              <>
                <Skeleton className="h-8 w-28 mb-1" />
                <Skeleton className="h-4 w-16" />
              </>
            ) : (
              <>
                <p className={`text-2xl font-bold transition-all duration-300 ${dailyPnl >= 0 ? 'text-green-accent' : 'text-red-accent'}`}>
                  {dailyPnl >= 0 ? '+' : ''}${dailyPnl.toFixed(2)}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  {dailyPnl >= 0 ? (
                    <TrendingUp className="w-3 h-3 text-green-accent" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-accent" />
                  )}
                  <span className={`text-xs ${dailyPnl >= 0 ? 'text-green-accent' : 'text-red-accent'}`}>
                    {dailyPnl >= 0 ? '+' : ''}{dailyPercent.toFixed(2)}%
                  </span>
                </div>
              </>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[200px]">
          <p>Your profit or loss for today across all connected exchanges</p>
        </TooltipContent>
      </Tooltip>

      {/* Weekly P&L - Cyan Card */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="glass-card card-cyan p-4 group cursor-default">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Weekly P&L</span>
              <div className="icon-container-cyan p-1.5 rounded-md">
                <DollarSign className="w-4 h-4 text-cyan" />
              </div>
            </div>
            {isDataLoading ? (
              <>
                <Skeleton className="h-8 w-28 mb-1" />
                <Skeleton className="h-4 w-16" />
              </>
            ) : (
              <>
                <p className={`text-2xl font-bold transition-all duration-300 ${weeklyPnl >= 0 ? 'text-cyan' : 'text-red-accent'}`}>
                  {weeklyPnl >= 0 ? '+' : ''}${weeklyPnl.toFixed(2)}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  {weeklyPnl >= 0 ? (
                    <TrendingUp className="w-3 h-3 text-cyan" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-accent" />
                  )}
                  <span className={`text-xs ${weeklyPnl >= 0 ? 'text-cyan' : 'text-red-accent'}`}>
                    {weeklyPnl >= 0 ? '+' : ''}{weeklyPercent.toFixed(2)}%
                  </span>
                </div>
              </>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[200px]">
          <p>Your profit or loss for the past 7 days</p>
        </TooltipContent>
      </Tooltip>

      {/* Total Equity - Yellow Card */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="glass-card card-yellow p-4 group cursor-default">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Total Equity</span>
                {isLive && (
                  <span className="flex items-center gap-1 text-xs text-green-accent bg-green-accent/10 px-1.5 py-0.5 rounded-full">
                    <StatusDot color="success" pulse size="xs" />
                    LIVE
                  </span>
                )}
              </div>
              <div className="icon-container-yellow p-1.5 rounded-md">
                <DollarSign className="w-4 h-4 text-yellow-accent" />
              </div>
            </div>
            {exchangeLoading ? (
              <>
                <Skeleton className="h-8 w-32 mb-1" />
                <Skeleton className="h-4 w-24" />
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-yellow-accent">
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
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[200px]">
          <p>Total balance across all your connected exchange accounts</p>
        </TooltipContent>
      </Tooltip>

      {/* Active Trades - Magenta Card */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="glass-card card-magenta p-4 group cursor-default">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Active Trades</span>
              <div className="icon-container-magenta p-1.5 rounded-md">
                <Activity className="w-4 h-4 text-magenta" />
              </div>
            </div>
            {isStoreLoading ? (
              <>
                <Skeleton className="h-8 w-12 mb-1" />
                <Skeleton className="h-4 w-20" />
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-magenta">{activeTrades}</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {activeTrades > 0 ? 'Positions open' : 'No open positions'}
                  </span>
                </div>
              </>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[200px]">
          <p>Number of currently open trading positions</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
