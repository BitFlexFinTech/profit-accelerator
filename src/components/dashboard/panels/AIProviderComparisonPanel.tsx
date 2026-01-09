import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Brain, Trophy, Target, TrendingUp, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

interface ProviderStats {
  ai_provider: string;
  total_recommendations: number;
  correct_predictions: number;
  accuracy_percent: number;
  avg_confidence: number;
  avg_profit: number;
}

interface ProviderInfo {
  provider_name: string;
  display_name: string;
  color_hex: string;
  success_count: number;
  error_count: number;
  total_latency_ms: number;
}

export function AIProviderComparisonPanel() {
  const [stats, setStats] = useState<ProviderStats[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    // Fetch AI decisions aggregated by provider
    const { data: decisions } = await supabase
      .from('ai_trade_decisions')
      .select('ai_provider, actual_profit, confidence, was_executed')
      .eq('was_executed', true)
      .not('actual_profit', 'is', null);

    // Fetch provider display info
    const { data: providerInfo } = await supabase
      .from('ai_providers')
      .select('provider_name, display_name, color_hex, success_count, error_count, total_latency_ms')
      .eq('is_enabled', true);

    if (providerInfo) {
      setProviders(providerInfo);
    }

    // Aggregate stats manually since view might not exist yet
    if (decisions && decisions.length > 0) {
      const aggregated: Record<string, ProviderStats> = {};
      
      for (const d of decisions) {
        if (!aggregated[d.ai_provider]) {
          aggregated[d.ai_provider] = {
            ai_provider: d.ai_provider,
            total_recommendations: 0,
            correct_predictions: 0,
            accuracy_percent: 0,
            avg_confidence: 0,
            avg_profit: 0,
          };
        }
        
        const stats = aggregated[d.ai_provider];
        stats.total_recommendations++;
        if (d.actual_profit > 0) stats.correct_predictions++;
        stats.avg_confidence += d.confidence || 0;
        stats.avg_profit += d.actual_profit || 0;
      }

      // Calculate averages
      const result = Object.values(aggregated).map(s => ({
        ...s,
        accuracy_percent: s.total_recommendations > 0 
          ? (s.correct_predictions / s.total_recommendations) * 100 
          : 0,
        avg_confidence: s.total_recommendations > 0 
          ? s.avg_confidence / s.total_recommendations 
          : 0,
        avg_profit: s.total_recommendations > 0 
          ? s.avg_profit / s.total_recommendations 
          : 0,
      }));

      // Sort by accuracy
      result.sort((a, b) => b.accuracy_percent - a.accuracy_percent);
      setStats(result);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('ai-decisions-watch')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ai_trade_decisions'
      }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getProviderColor = (providerName: string) => {
    const provider = providers.find(p => p.provider_name === providerName);
    return provider?.color_hex || '#6366f1';
  };

  const getProviderDisplayName = (providerName: string) => {
    const provider = providers.find(p => p.provider_name === providerName);
    return provider?.display_name || providerName;
  };

  const getProviderLatency = (providerName: string) => {
    const provider = providers.find(p => p.provider_name === providerName);
    if (!provider || !provider.success_count) return 0;
    return Math.round(provider.total_latency_ms / provider.success_count);
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="flex items-center justify-center py-8">
          <span className="text-muted-foreground">Loading AI comparison...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          AI Provider Comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Brain className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-xs">No AI decisions recorded yet</p>
            <p className="text-xs mt-1">Complete trades to see provider accuracy</p>
          </div>
        ) : (
          <>
            {stats.map((stat, index) => (
              <motion.div
                key={stat.ai_provider}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-3 rounded-lg border bg-secondary/20"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {index === 0 && stats.length > 1 && (
                      <Trophy className="w-4 h-4 text-yellow-500" />
                    )}
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: getProviderColor(stat.ai_provider) }}
                    />
                    <span className="text-sm font-medium">
                      {getProviderDisplayName(stat.ai_provider)}
                    </span>
                  </div>
                  <Badge 
                    variant={stat.accuracy_percent >= 60 ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {stat.accuracy_percent.toFixed(1)}% accurate
                  </Badge>
                </div>

                <Progress 
                  value={stat.accuracy_percent} 
                  className="h-2 mb-2"
                />

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <Target className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Trades:</span>
                    <span className="font-mono">{stat.total_recommendations}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Avg P&L:</span>
                    <span className={`font-mono ${stat.avg_profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                      ${stat.avg_profit.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Latency:</span>
                    <span className="font-mono">
                      {getProviderLatency(stat.ai_provider)}ms
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Summary */}
            <div className="pt-2 border-t text-center">
              <p className="text-xs text-muted-foreground">
                Best performer: <span className="font-medium text-foreground">
                  {stats.length > 0 ? getProviderDisplayName(stats[0].ai_provider) : 'N/A'}
                </span>
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
