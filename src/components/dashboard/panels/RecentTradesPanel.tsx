import { useEffect, useState, useCallback } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store/useAppStore';

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
      const { data, error } = await supabase
        .from('trading_journal')
        .select('id, symbol, exchange, side, pnl, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setTrades(data || []);
    } catch (err) {
      console.error('Failed to fetch recent trades:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Subscribe to SSOT store updates instead of own channel
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
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Trades</h3>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 bg-secondary/30 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold mb-4">Recent Trades</h3>
      
      {trades.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No trades yet</p>
          <p className="text-xs mt-1 opacity-70">Trades will appear here when executed</p>
        </div>
      ) : (
        <div className="space-y-3">
          {trades.map((trade) => {
            const isLong = trade.side?.toLowerCase() === 'long' || trade.side?.toLowerCase() === 'buy';
            const pnl = trade.pnl ?? 0;
            
            return (
              <div
                key={trade.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isLong ? 'bg-success/20' : 'bg-destructive/20'
                  }`}>
                    {isLong ? (
                      <ArrowUpRight className="w-4 h-4 text-success" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 text-destructive" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{trade.symbol}</p>
                    <p className="text-xs text-muted-foreground">
                      {trade.exchange} • {formatTime(trade.created_at)}
                    </p>
                  </div>
                </div>
                
                <span className={`font-bold ${pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <button className="w-full mt-4 py-2 text-sm text-primary hover:underline">
        View All Trades →
      </button>
    </div>
  );
}