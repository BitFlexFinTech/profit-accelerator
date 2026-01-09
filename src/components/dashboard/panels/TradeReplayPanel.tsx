import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  History, Clock, DollarSign, Brain, ChevronDown, ChevronUp, 
  ArrowUpRight, ArrowDownRight, Timer, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TradeRecord {
  id: string;
  exchange: string;
  symbol: string;
  side: string;
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  pnl: number | null;
  status: string | null;
  ai_reasoning: string | null;
  execution_latency_ms: number | null;
  created_at: string;
  closed_at: string | null;
  paper_trade: boolean | null;
}

export function TradeReplayPanel() {
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'simulation' | 'paper' | 'live'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchTrades = async () => {
    let query = supabase
      .from('trading_journal')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (filter === 'paper') {
      query = query.eq('paper_trade', true);
    } else if (filter === 'live') {
      query = query.eq('paper_trade', false);
    }

    const { data, error } = await query;
    if (!error && data) {
      setTrades(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTrades();
  }, [filter]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const getTradeTypeLabel = (trade: TradeRecord) => {
    if (trade.paper_trade) return 'Paper';
    if (trade.ai_reasoning?.toLowerCase().includes('simulation')) return 'Simulation';
    return 'Live';
  };

  const getTradeTypeColor = (trade: TradeRecord) => {
    if (trade.paper_trade) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (trade.ai_reasoning?.toLowerCase().includes('simulation')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    return 'bg-success/20 text-success border-success/30';
  };

  return (
    <Card className="glass-card h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Trade Replay
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {trades.length} trades
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="px-4">
          <TabsList className="grid grid-cols-4 w-full h-8">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger value="simulation" className="text-xs">Simulation</TabsTrigger>
            <TabsTrigger value="paper" className="text-xs">Paper</TabsTrigger>
            <TabsTrigger value="live" className="text-xs">Live</TabsTrigger>
          </TabsList>
        </Tabs>

        <ScrollArea className="h-[400px] mt-2">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Loading trades...
            </div>
          ) : trades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <History className="w-12 h-12 mb-2 opacity-20" />
              <p className="text-sm">No trades found</p>
            </div>
          ) : (
            <div className="space-y-1 px-4 pb-4">
              {trades.map((trade) => (
                <motion.div
                  key={trade.id}
                  layout
                  className="border rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => toggleExpand(trade.id)}
                    className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-full ${trade.side === 'buy' ? 'bg-success/20' : 'bg-destructive/20'}`}>
                        {trade.side === 'buy' ? (
                          <ArrowUpRight className="w-3 h-3 text-success" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3 text-destructive" />
                        )}
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{trade.symbol}</span>
                          <Badge className={`text-[10px] px-1.5 ${getTradeTypeColor(trade)}`}>
                            {getTradeTypeLabel(trade)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(trade.created_at), 'MMM d, HH:mm')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {trade.pnl !== null && (
                        <span className={`font-mono text-sm ${trade.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                        </span>
                      )}
                      {expandedId === trade.id ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  <AnimatePresence>
                    {expandedId === trade.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t bg-muted/30"
                      >
                        <div className="p-3 space-y-3">
                          {/* Trade Details Grid */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-3 h-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Entry:</span>
                              <span className="font-mono">${trade.entry_price.toFixed(2)}</span>
                            </div>
                            {trade.exit_price && (
                              <div className="flex items-center gap-2">
                                <DollarSign className="w-3 h-3 text-muted-foreground" />
                                <span className="text-muted-foreground">Exit:</span>
                                <span className="font-mono">${trade.exit_price.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <Timer className="w-3 h-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Qty:</span>
                              <span className="font-mono">{trade.quantity}</span>
                            </div>
                            {trade.execution_latency_ms && (
                              <div className="flex items-center gap-2">
                                <Zap className="w-3 h-3 text-muted-foreground" />
                                <span className="text-muted-foreground">Latency:</span>
                                <span className="font-mono">{trade.execution_latency_ms}ms</span>
                              </div>
                            )}
                          </div>

                          {/* AI Reasoning */}
                          {trade.ai_reasoning && (
                            <div className="p-2 rounded bg-primary/5 border border-primary/20">
                              <div className="flex items-center gap-1 mb-1">
                                <Brain className="w-3 h-3 text-primary" />
                                <span className="text-xs font-medium text-primary">AI Reasoning</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {trade.ai_reasoning}
                              </p>
                            </div>
                          )}

                          {/* Timeline */}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span>
                              Opened {formatDistanceToNow(new Date(trade.created_at), { addSuffix: true })}
                            </span>
                            {trade.closed_at && (
                              <>
                                <span>•</span>
                                <span>
                                  Closed {formatDistanceToNow(new Date(trade.closed_at), { addSuffix: true })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
