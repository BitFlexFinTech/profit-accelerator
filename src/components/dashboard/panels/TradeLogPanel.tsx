import { useState, useEffect } from 'react';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Zap,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Trade {
  id: string;
  symbol: string;
  side: string;
  exchange: string;
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  pnl: number | null;
  status: string | null;
  created_at: string | null;
  closed_at: string | null;
  execution_latency_ms?: number | null;
}

export function TradeLogPanel() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const fetchTrades = async () => {
    // STRICT RULE: Fetch ALL trades - no limits
    const { data, error } = await supabase
      .from('trading_journal')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTrades(data as Trade[]);
    }
    setIsLoading(false);
    setLastUpdate(new Date());
  };

  useEffect(() => {
    fetchTrades();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('trade_log_realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trading_journal'
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          // STRICT RULE: No slicing - keep ALL trades
          setTrades(prev => {
            if (prev.some(t => t.id === (payload.new as Trade).id)) return prev;
            return [payload.new as Trade, ...prev];
          });
        } else if (payload.eventType === 'UPDATE') {
          setTrades(prev => prev.map(t => 
            t.id === (payload.new as Trade).id ? payload.new as Trade : t
          ));
        }
        setLastUpdate(new Date());
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const sessionStats = {
    totalPnL: trades.reduce((sum, t) => sum + (t.pnl || 0), 0),
    totalTrades: trades.length,
    winRate: trades.length > 0 
      ? (trades.filter(t => (t.pnl || 0) > 0).length / trades.filter(t => t.status === 'closed').length) * 100 
      : 0,
    avgLatency: trades.length > 0 
      ? Math.round(trades.reduce((sum, t) => sum + (t.execution_latency_ms || 20), 0) / trades.length)
      : 0,
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '--:--';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return price.toFixed(4);
  };

  const timeSinceUpdate = () => {
    const seconds = Math.floor((new Date().getTime() - lastUpdate.getTime()) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };

  return (
    <div className="glass-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Trade Log ({trades.length} trades)</h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Real-time feed • Updated {timeSinceUpdate()}
            </p>
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={fetchTrades}>
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Trade Table */}
      <ScrollArea className="h-[280px]">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b border-border sticky top-0 bg-background">
            <tr>
              <th className="text-left py-2 font-medium">Time</th>
              <th className="text-left py-2 font-medium">Pair</th>
              <th className="text-left py-2 font-medium">Side</th>
              <th className="text-right py-2 font-medium">Entry</th>
              <th className="text-right py-2 font-medium">Exit</th>
              <th className="text-right py-2 font-medium">P/L</th>
              <th className="text-right py-2 font-medium">Lat</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-muted-foreground">
                  No trades yet
                </td>
              </tr>
            ) : (
              trades.map((trade) => (
                <tr key={trade.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-2 font-mono text-xs text-muted-foreground">
                    {formatTime(trade.created_at)}
                  </td>
                  <td className="py-2">
                    <span className="font-medium">{trade.symbol}</span>
                    <span className="text-xs text-muted-foreground ml-1">/{trade.exchange}</span>
                  </td>
                  <td className="py-2">
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${
                        trade.side === 'long' || trade.side === 'buy' 
                          ? 'border-green-500/50 text-green-500' 
                          : 'border-red-500/50 text-red-500'
                      }`}
                    >
                      {trade.side === 'long' || trade.side === 'buy' ? (
                        <TrendingUp className="w-3 h-3 mr-1" />
                      ) : (
                        <TrendingDown className="w-3 h-3 mr-1" />
                      )}
                      {trade.side.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="py-2 text-right font-mono text-xs">
                    {formatPrice(trade.entry_price)}
                  </td>
                  <td className="py-2 text-right font-mono text-xs">
                    {trade.exit_price ? formatPrice(trade.exit_price) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </td>
                  <td className={`py-2 text-right font-mono text-xs font-medium ${
                    trade.status === 'open' ? 'text-muted-foreground' :
                    (trade.pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {trade.status === 'open' ? (
                      <Badge variant="outline" className="text-xs">OPEN</Badge>
                    ) : (
                      `${(trade.pnl || 0) >= 0 ? '+' : ''}$${(trade.pnl || 0).toFixed(2)}`
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <span className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                      <Zap className="w-3 h-3" />
                      {trade.execution_latency_ms ? `${trade.execution_latency_ms}ms` : '--'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollArea>

      {/* Session Stats */}
      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Session P/L</p>
          <p className={`font-bold ${sessionStats.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {sessionStats.totalPnL >= 0 ? '+' : ''}${sessionStats.totalPnL.toFixed(2)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Trades</p>
          <p className="font-bold">{sessionStats.totalTrades}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Win Rate</p>
          <p className="font-bold">{sessionStats.winRate.toFixed(0)}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Clock className="w-3 h-3" /> Avg Lat
          </p>
          <p className="font-bold">{sessionStats.avgLatency}ms</p>
        </div>
      </div>
    </div>
  );
}
