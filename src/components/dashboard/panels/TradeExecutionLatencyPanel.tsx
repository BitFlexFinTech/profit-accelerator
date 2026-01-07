import { Zap, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useTradeExecutionMetrics } from '@/hooks/useTradeExecutionMetrics';
import { cn } from '@/lib/utils';

const EXCHANGES = ['binance', 'okx'];
const MAX_LATENCY = 150; // For progress bar scaling

export function TradeExecutionLatencyPanel() {
  const { timeRange, setTimeRange, getLatencyStats, loading } = useTradeExecutionMetrics();

  const getLatencyColor = (ms: number) => {
    if (ms === 0) return 'text-muted-foreground';
    if (ms < 50) return 'text-success';
    if (ms < 100) return 'text-warning';
    return 'text-destructive';
  };

  const getLatencyBgColor = (ms: number) => {
    if (ms === 0) return 'bg-muted';
    if (ms < 50) return 'bg-success';
    if (ms < 100) return 'bg-warning';
    return 'bg-destructive';
  };

  const getDistributionTotal = (stats: ReturnType<typeof getLatencyStats>) => {
    const { distribution } = stats;
    return distribution.under25 + distribution.under50 + distribution.under100 + distribution.over100;
  };

  const getDistributionPercent = (count: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((count / total) * 100);
  };

  return (
    <div className="glass-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <h3 className="font-semibold text-sm">Trade Execution Latency</h3>
        </div>
        
        {/* Time Range Filter */}
        <div className="flex gap-1">
          {(['5m', '1h', '24h'] as const).map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? 'default' : 'ghost'}
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setTimeRange(range)}
            >
              {range}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground text-sm py-4">Loading...</div>
      ) : (
        <>
          {/* Exchange Stats Grid */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {EXCHANGES.map((exchange) => {
              const stats = getLatencyStats(exchange);
              return (
                <div key={exchange} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase">{exchange}</span>
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      stats.count > 0 ? getLatencyBgColor(stats.avg) : 'bg-muted-foreground/30'
                    )} />
                  </div>

                  {/* Average Latency */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-6">Avg</span>
                    <Progress 
                      value={Math.min((stats.avg / MAX_LATENCY) * 100, 100)} 
                      className="h-1.5 flex-1" 
                    />
                    <span className={cn("text-xs font-mono w-12 text-right", getLatencyColor(stats.avg))}>
                      {stats.avg > 0 ? `${stats.avg}ms` : '—'}
                    </span>
                  </div>

                  {/* Min Latency */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-6">Min</span>
                    <Progress 
                      value={Math.min((stats.min / MAX_LATENCY) * 100, 100)} 
                      className="h-1.5 flex-1" 
                    />
                    <span className={cn("text-xs font-mono w-12 text-right", getLatencyColor(stats.min))}>
                      {stats.min > 0 ? `${stats.min}ms` : '—'}
                    </span>
                  </div>

                  {/* Max Latency */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-6">Max</span>
                    <Progress 
                      value={Math.min((stats.max / MAX_LATENCY) * 100, 100)} 
                      className="h-1.5 flex-1" 
                    />
                    <span className={cn("text-xs font-mono w-12 text-right", getLatencyColor(stats.max))}>
                      {stats.max > 0 ? `${stats.max}ms` : '—'}
                    </span>
                  </div>

                  {/* Order Count */}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
                    <Activity className="w-3 h-3" />
                    <span>{stats.count} orders</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Latency Distribution */}
          <div className="pt-3 border-t border-border/50">
            <div className="flex items-center gap-1 mb-2">
              <span className="text-xs font-medium">📊 Latency Distribution</span>
            </div>
            
            {(() => {
              // Combine stats from all exchanges
              const allStats = EXCHANGES.reduce((acc, exchange) => {
                const stats = getLatencyStats(exchange);
                return {
                  under25: acc.under25 + stats.distribution.under25,
                  under50: acc.under50 + stats.distribution.under50,
                  under100: acc.under100 + stats.distribution.under100,
                  over100: acc.over100 + stats.distribution.over100,
                };
              }, { under25: 0, under50: 0, under100: 0, over100: 0 });
              
              const total = allStats.under25 + allStats.under50 + allStats.under100 + allStats.over100;
              
              if (total === 0) {
                return (
                  <div className="text-xs text-muted-foreground text-center py-2">
                    No execution data yet
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-success">{'<'}25ms:</span>
                    <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                      <div 
                        className="h-full bg-success" 
                        style={{ width: `${getDistributionPercent(allStats.under25, total)}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground w-8">{getDistributionPercent(allStats.under25, total)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-success/80">25-50ms:</span>
                    <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                      <div 
                        className="h-full bg-success/80" 
                        style={{ width: `${getDistributionPercent(allStats.under50, total)}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground w-8">{getDistributionPercent(allStats.under50, total)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-warning">50-100ms:</span>
                    <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                      <div 
                        className="h-full bg-warning" 
                        style={{ width: `${getDistributionPercent(allStats.under100, total)}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground w-8">{getDistributionPercent(allStats.under100, total)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-destructive">{'>'}100ms:</span>
                    <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                      <div 
                        className="h-full bg-destructive" 
                        style={{ width: `${getDistributionPercent(allStats.over100, total)}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground w-8">{getDistributionPercent(allStats.over100, total)}%</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
