import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCloudInfrastructure, PROVIDER_ICONS } from '@/hooks/useCloudInfrastructure';
import { 
  BarChart3, 
  Play, 
  RefreshCw, 
  Clock, 
  Zap,
  Trophy,
  Cpu,
  HardDrive,
  Gauge
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

export function VPSBenchmarkPanel() {
  const { providers, benchmarkResults, runBenchmark, refresh } = useCloudInfrastructure();
  const [runningBenchmarks, setRunningBenchmarks] = useState<Set<string>>(new Set());
  const [isRunningAll, setIsRunningAll] = useState(false);

  const runningProviders = providers.filter(
    p => p.status === 'running' || p.status === 'idle'
  );

  const handleRunBenchmark = async (provider: string) => {
    setRunningBenchmarks(prev => new Set(prev).add(provider));
    const result = await runBenchmark(provider);
    if (result.success) {
      toast.success(`Benchmark started for ${provider}`);
    } else {
      toast.error(`Failed to run benchmark for ${provider}`);
    }
    setTimeout(() => {
      setRunningBenchmarks(prev => {
        const next = new Set(prev);
        next.delete(provider);
        return next;
      });
      refresh();
    }, 5000);
  };

  const handleRunAll = async () => {
    setIsRunningAll(true);
    toast.info(`Running benchmarks on ${runningProviders.length} providers...`);
    
    for (const provider of runningProviders) {
      await handleRunBenchmark(provider.provider);
      // Small delay between benchmarks
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setIsRunningAll(false);
    toast.success('All benchmarks completed');
  };

  // Sort providers by HFT score (descending)
  const sortedProviders = [...runningProviders].sort((a, b) => {
    const aScore = benchmarkResults[a.provider]?.hft_score || 0;
    const bScore = benchmarkResults[b.provider]?.hft_score || 0;
    return bScore - aScore;
  });

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-success';
    if (score >= 50) return 'bg-warning';
    return 'bg-destructive';
  };

  return (
    <Card className="p-6 bg-card/50 border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-accent" />
          <h3 className="font-semibold">VPS Performance Benchmarks</h3>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRunAll}
          disabled={isRunningAll || runningProviders.length === 0}
        >
          {isRunningAll ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Run All Benchmarks
        </Button>
      </div>

      {/* Benchmark Results */}
      <ScrollArea className="h-[300px]">
        {runningProviders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <BarChart3 className="h-8 w-8 mb-2" />
            <p className="text-sm">No running VPS nodes to benchmark</p>
            <p className="text-xs mt-1">Deploy a VPS first to run benchmarks</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedProviders.map((provider, idx) => {
              const benchmark = benchmarkResults[provider.provider];
              const isRunning = runningBenchmarks.has(provider.provider);
              const isTop3 = idx < 3 && benchmark?.hft_score;
              
              return (
                <div
                  key={provider.provider}
                  className={cn(
                    "p-4 rounded-lg border transition-all",
                    isTop3 && idx === 0 ? "bg-warning/10 border-warning/30" :
                    isTop3 ? "bg-muted/30 border-border/30" : "bg-secondary/30 border-border/30",
                    isRunning && "animate-pulse"
                  )}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {/* Rank Badge */}
                      {isTop3 && benchmark?.hft_score && (
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                          idx === 0 ? "bg-warning text-warning-foreground" :
                          idx === 1 ? "bg-muted text-muted-foreground" :
                          "bg-orange-500/20 text-orange-500"
                        )}>
                          {idx === 0 ? <Trophy className="h-3 w-3" /> : idx + 1}
                        </div>
                      )}
                      
                      <span className="text-xl">{PROVIDER_ICONS[provider.provider]}</span>
                      <div>
                        <p className="font-medium capitalize">{provider.provider}</p>
                        <p className="text-xs text-muted-foreground">{provider.region}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {benchmark?.hft_score && (
                        <div className="text-right">
                          <span className={cn("text-2xl font-bold", getScoreColor(benchmark.hft_score))}>
                            {benchmark.hft_score.toFixed(0)}
                          </span>
                          <span className="text-xs text-muted-foreground">/100</span>
                        </div>
                      )}
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        disabled={isRunning}
                        onClick={() => handleRunBenchmark(provider.provider)}
                      >
                        {isRunning ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Benchmark Metrics */}
                  {benchmark ? (
                    <div className="space-y-2">
                      {/* HFT Score Bar */}
                      <div className="flex items-center gap-2">
                        <Zap className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground w-16">HFT Score</span>
                        <Progress 
                          value={benchmark.hft_score || 0} 
                          className={cn("h-2 flex-1", getScoreBg(benchmark.hft_score || 0))}
                        />
                      </div>

                      {/* Latency */}
                      <div className="flex items-center gap-2">
                        <Gauge className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground w-16">Latency</span>
                        <Progress 
                          value={Math.min(100, 100 - (provider.latency_ms / 2))} 
                          className="h-2 flex-1"
                        />
                        <span className="text-xs font-mono w-12 text-right">
                          {provider.latency_ms}ms
                        </span>
                      </div>

                      {/* Exchange Latencies */}
                      {benchmark.exchange_latencies && Object.keys(benchmark.exchange_latencies).length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/30">
                          <p className="text-xs text-muted-foreground mb-1">Exchange Latencies:</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(benchmark.exchange_latencies).map(([exchange, latency]) => (
                              <Badge 
                                key={exchange} 
                                variant="outline" 
                                className="text-xs font-mono"
                              >
                                {exchange}: {latency}ms
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Last Run */}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                        <Clock className="h-3 w-3" />
                        <span>
                          {benchmark.run_at 
                            ? formatDistanceToNow(new Date(benchmark.run_at), { addSuffix: true })
                            : 'Never run'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
                      {isRunning ? (
                        <span className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Running benchmark...
                        </span>
                      ) : (
                        <span>No benchmark data - click play to run</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="text-xs text-muted-foreground pt-3 mt-4 border-t border-border/50">
        HFT Score = Latency (40%) + Throughput (30%) + CPU (20%) + Memory (10%)
      </div>
    </Card>
  );
}
