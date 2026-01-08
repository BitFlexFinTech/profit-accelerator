import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight, ArrowDownRight, Terminal, Activity, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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
  execution_latency_ms?: number | null;
}

// Exchange badge colors
const EXCHANGE_COLORS: Record<string, string> = {
  binance: 'border-yellow-500 text-yellow-500',
  okx: 'border-blue-500 text-blue-500',
  bybit: 'border-orange-500 text-orange-500',
  bitget: 'border-green-500 text-green-500',
  mexc: 'border-sky-500 text-sky-500',
  'gate.io': 'border-purple-500 text-purple-500',
  kucoin: 'border-cyan-500 text-cyan-500',
  kraken: 'border-violet-500 text-violet-500',
  bingx: 'border-pink-500 text-pink-500',
  hyperliquid: 'border-teal-500 text-teal-500',
};

interface TradeActivityTerminalProps {
  expanded?: boolean;
  compact?: boolean;
  className?: string;
}

export function TradeActivityTerminal({ expanded = false, compact = false, className }: TradeActivityTerminalProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrades = async () => {
    try {
      const limit = expanded ? 50 : compact ? 10 : 15;
      
      // Fetch trades - execution_latency_ms is already in trading_journal
      const { data: tradesData, error } = await supabase
        .from('trading_journal')
        .select('id, symbol, exchange, side, entry_price, exit_price, quantity, pnl, status, created_at, execution_latency_ms')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      
      setTrades(tradesData || []);
    } catch (err) {
      console.error('Failed to fetch trades:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades();

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
  }, [expanded, compact]);

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
    <Card className={cn("bg-card/50 border-border/50 backdrop-blur-sm h-full flex flex-col", className)}>
      <CardHeader className="pb-2 flex-shrink-0 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Live Trade Activity</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <Activity className="h-3 w-3 text-success animate-pulse" />
            <span className="text-xs text-muted-foreground">LIVE</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 flex-1 min-h-0 overflow-hidden px-3 pb-2">
        <ScrollArea className="h-full pr-2">
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
                      <div className={`p-0.5 rounded ${isLong ? 'bg-success/20' : 'bg-destructive/20'}`}>
                        {isLong ? (
                          <ArrowUpRight className="h-3 w-3 text-success" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3 text-destructive" />
                        )}
                      </div>
                      <span className="font-semibold text-foreground">{trade.symbol}</span>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[10px] h-4 px-1",
                          EXCHANGE_COLORS[trade.exchange?.toLowerCase()] || 'border-muted-foreground text-muted-foreground'
                        )}
                      >
                        {trade.exchange?.toUpperCase()}
                      </Badge>
                      {trade.execution_latency_ms && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5 text-yellow-400" />
                          {trade.execution_latency_ms}ms
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">
                        @ {formatPrice(trade.entry_price)}
                      </span>
                      {hasPnl ? (
                        <span className={`font-bold min-w-[60px] text-right ${isProfitable ? 'text-success' : 'text-destructive'}`}>
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