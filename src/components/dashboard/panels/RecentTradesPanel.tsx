import { useEffect, useState, useCallback } from 'react';
import { ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store/useAppStore';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Trade {
  id: string;
  symbol: string;
  exchange: string;
  side: string;
  pnl: number | null;
  created_at: string | null;
}

export function RecentTradesPanel() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const lastUpdate = useAppStore((s) => s.lastUpdate);

  const fetchTrades = useCallback(async () => {
    try {
      // STRICT RULE: Fetch ALL trades - no limits
      const { data, error } = await supabase
        .from('trading_journal')
        .select('id, symbol, exchange, side, pnl, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTrades(data || []);
    } catch (err) {
      console.error('Failed to fetch recent trades:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades, lastUpdate]);

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return '--';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hr ago`;
    return `${Math.floor(diffMins / 1440)} days ago`;
  };

  if (loading) {
    return (
      <div className="card-pink p-6 transition-all duration-300">
        <div className="flex items-center gap-3 mb-4">
          <div className="icon-container-pink animate-pulse">
            <TrendingUp className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-semibold">Recent Trades</h3>
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 bg-pink-500/10 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="card-pink p-6 transition-all duration-300 hover:scale-[1.01]">
        <div className="flex items-center gap-3 mb-4">
          <div className="icon-container-pink animate-float">
            <TrendingUp className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-semibold text-pink-300">Recent Trades ({trades.length})</h3>
        </div>
        
        {trades.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No trades yet</p>
            <p className="text-xs mt-1 opacity-70">Trades will appear here when executed</p>
          </div>
        ) : (
          <div className="space-y-3">
            {trades.map((trade, index) => {
              const isLong = trade.side?.toLowerCase() === 'long' || trade.side?.toLowerCase() === 'buy';
              const pnl = trade.pnl ?? 0;
              
              return (
                <div
                  key={trade.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg transition-all duration-300 animate-fade-slide-in",
                    isLong 
                      ? "bg-gradient-to-r from-emerald-500/20 to-emerald-600/10 border border-emerald-400/20 hover:border-emerald-400/40"
                      : "bg-gradient-to-r from-rose-500/20 to-rose-600/10 border border-rose-400/20 hover:border-rose-400/40"
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300",
                          isLong ? 'bg-emerald-500/30' : 'bg-rose-500/30'
                        )}>
                          {isLong ? (
                            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <ArrowDownRight className="w-4 h-4 text-rose-400" />
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{isLong ? 'Long position (Buy)' : 'Short position (Sell)'}</p>
                      </TooltipContent>
                    </Tooltip>
                    <div>
                      <p className={cn(
                        "font-medium",
                        isLong ? 'text-emerald-300' : 'text-rose-300'
                      )}>{trade.symbol}</p>
                      <p className="text-xs text-muted-foreground">
                        {trade.exchange} • {formatTime(trade.created_at)}
                      </p>
                    </div>
                  </div>
                  
                  <span className={cn(
                    "font-bold transition-all duration-300",
                    pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  )}>
                    {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button className="w-full mt-4 py-2 text-sm text-pink-400 hover:text-pink-300 hover:underline transition-all duration-300">
              View All Trades →
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Open complete trade history</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
