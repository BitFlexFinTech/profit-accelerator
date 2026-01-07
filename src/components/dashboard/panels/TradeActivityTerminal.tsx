import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight, ArrowDownRight, Terminal, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface Trade {
  id: string;
  symbol: string;
  exchange: string;
  side: string;
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  pnl: number | null;
  status: string | null;
  created_at: string | null;
}

export function TradeActivityTerminal() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrades = async () => {
    try {
      const { data, error } = await supabase
        .from('trading_journal')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15);

      if (error) throw error;
      setTrades(data || []);
    } catch (err) {
      console.error('Failed to fetch trades:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades();

    // Real-time subscription for new trades
    const channel = supabase
      .channel('trade-activity-terminal')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trading_journal'
      }, () => {
        fetchTrades();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return '--';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return format(date, 'MMM dd HH:mm');
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    return `$${price.toFixed(4)}`;
  };

  return (
    <Card className="bg-card/50 border-border/50 backdrop-blur-sm h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Trade Activity</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <Activity className="h-3 w-3 text-green-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">LIVE</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[200px] pr-2">
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-secondary/30 rounded animate-pulse" />
              ))}
            </div>
          ) : trades.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-8">
              <Terminal className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No trades yet</p>
              <p className="text-xs opacity-70">Trades will appear here in real-time</p>
            </div>
          ) : (
            <div className="space-y-1 font-mono text-xs">
              {trades.map((trade) => {
                const isLong = trade.side?.toLowerCase() === 'long' || trade.side?.toLowerCase() === 'buy';
                const hasPnl = trade.pnl !== null && trade.pnl !== undefined;
                const isProfitable = hasPnl && trade.pnl! >= 0;

                return (
                  <div
                    key={trade.id}
                    className="flex items-center justify-between px-2 py-1.5 rounded bg-secondary/20 hover:bg-secondary/40 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-12">{formatTime(trade.created_at)}</span>
                      <div className={`p-0.5 rounded ${isLong ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                        {isLong ? (
                          <ArrowUpRight className="h-3 w-3 text-green-500" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3 text-red-500" />
                        )}
                      </div>
                      <span className="font-semibold text-foreground">{trade.symbol}</span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {trade.exchange}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">
                        @ {formatPrice(trade.entry_price)}
                      </span>
                      {hasPnl ? (
                        <span className={`font-bold min-w-[60px] text-right ${isProfitable ? 'text-green-500' : 'text-red-500'}`}>
                          {isProfitable ? '+' : ''}{trade.pnl!.toFixed(2)} USDT
                        </span>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] h-4">
                          {trade.status || 'OPEN'}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}