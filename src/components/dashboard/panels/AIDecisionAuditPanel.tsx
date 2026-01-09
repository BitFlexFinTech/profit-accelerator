import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { 
  Brain, ArrowUpRight, ArrowDownRight, Clock, CheckCircle, 
  XCircle, Loader2, ChevronDown, ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AIDecision {
  id: string;
  created_at: string;
  symbol: string;
  exchange: string;
  ai_provider: string;
  recommended_side: string;
  confidence: number;
  reasoning: string | null;
  entry_price: number | null;
  target_price: number | null;
  expected_profit_percent: number | null;
  actual_outcome: string | null;
  actual_profit: number | null;
  was_executed: boolean;
}

export function AIDecisionAuditPanel() {
  const [decisions, setDecisions] = useState<AIDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchDecisions = async () => {
    const { data, error } = await supabase
      .from('ai_trade_decisions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      setDecisions(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDecisions();

    const channel = supabase
      .channel('ai-audit-watch')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ai_trade_decisions'
      }, () => {
        fetchDecisions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-success';
    if (confidence >= 60) return 'text-warning';
    return 'text-muted-foreground';
  };

  const getOutcomeIcon = (decision: AIDecision) => {
    if (!decision.was_executed) {
      return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
    if (decision.actual_profit === null) {
      return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
    }
    if (decision.actual_profit > 0) {
      return <CheckCircle className="w-4 h-4 text-success" />;
    }
    return <XCircle className="w-4 h-4 text-destructive" />;
  };

  return (
    <Card className="glass-card h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            AI Decision Audit Log
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {decisions.length} decisions
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Loading decisions...
            </div>
          ) : decisions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Brain className="w-10 h-10 mb-2 opacity-20" />
              <p className="text-xs">No AI decisions yet</p>
            </div>
          ) : (
            <div className="space-y-1 px-4 pb-4">
              {decisions.map((decision) => (
                <motion.div
                  key={decision.id}
                  layout
                  className="border rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedId(expandedId === decision.id ? null : decision.id)}
                    className="w-full p-2 flex items-center justify-between hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`p-1 rounded-full ${
                        decision.recommended_side === 'long' ? 'bg-success/20' : 'bg-destructive/20'
                      }`}>
                        {decision.recommended_side === 'long' ? (
                          <ArrowUpRight className="w-3 h-3 text-success" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3 text-destructive" />
                        )}
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium">{decision.symbol}</span>
                          <Badge variant="outline" className="text-[10px] px-1">
                            {decision.ai_provider}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(decision.created_at), 'HH:mm:ss')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono ${getConfidenceColor(decision.confidence)}`}>
                        {decision.confidence}%
                      </span>
                      {getOutcomeIcon(decision)}
                      {expandedId === decision.id ? (
                        <ChevronUp className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  <AnimatePresence>
                    {expandedId === decision.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t bg-muted/30"
                      >
                        <div className="p-2 space-y-2">
                          {decision.reasoning && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">Reasoning: </span>
                              <span>{decision.reasoning}</span>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            {decision.entry_price && (
                              <div>
                                <span className="text-muted-foreground">Entry: </span>
                                <span className="font-mono">${decision.entry_price.toFixed(2)}</span>
                              </div>
                            )}
                            {decision.target_price && (
                              <div>
                                <span className="text-muted-foreground">Target: </span>
                                <span className="font-mono">${decision.target_price.toFixed(2)}</span>
                              </div>
                            )}
                            {decision.expected_profit_percent && (
                              <div>
                                <span className="text-muted-foreground">Expected: </span>
                                <span className="text-success">+{decision.expected_profit_percent.toFixed(2)}%</span>
                              </div>
                            )}
                            {decision.actual_profit !== null && (
                              <div>
                                <span className="text-muted-foreground">Actual: </span>
                                <span className={decision.actual_profit >= 0 ? 'text-success' : 'text-destructive'}>
                                  {decision.actual_profit >= 0 ? '+' : ''}${decision.actual_profit.toFixed(2)}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={decision.was_executed ? 'default' : 'secondary'}
                              className="text-[10px]"
                            >
                              {decision.was_executed ? 'Executed' : 'Not Executed'}
                            </Badge>
                            {decision.actual_outcome && (
                              <Badge 
                                variant={decision.actual_outcome === 'profit' ? 'default' : 'destructive'}
                                className="text-[10px]"
                              >
                                {decision.actual_outcome}
                              </Badge>
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
