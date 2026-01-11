import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useCloudInfrastructure, PROVIDER_ICONS } from '@/hooks/useCloudInfrastructure';
import { Activity, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend, CartesianGrid } from 'recharts';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CHART_COLORS, chartStyles } from '@/lib/chartTheme';

const PROVIDER_COLORS: Record<string, string> = {
  contabo: '#22c55e',
  vultr: '#3b82f6',
  aws: '#f97316',
  digitalocean: '#06b6d4',
  gcp: '#4285f4',
  oracle: '#f43f5e',
  alibaba: '#ea580c',
  azure: '#0ea5e9',
};

const LATENCY_THRESHOLD = 150;

export function VPSLatencyTrendsPanel() {
  const { latencyHistory, providers, isLoading, refresh } = useCloudInfrastructure();
  const [visibleProviders, setVisibleProviders] = useState<Set<string>>(
    new Set(Object.keys(PROVIDER_COLORS))
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    refresh();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const toggleProvider = (provider: string) => {
    setVisibleProviders(prev => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  };

  // Transform latency history into chart data format
  const chartData = useMemo(() => {
    if (!latencyHistory || latencyHistory.length === 0) return [];

    // Group by timestamp (rounded to 5-minute intervals)
    const grouped: Record<string, Record<string, number>> = {};
    
    for (const point of latencyHistory) {
      if (!point.recorded_at) continue;
      
      const date = new Date(point.recorded_at);
      // Round to 5-minute intervals
      date.setMinutes(Math.floor(date.getMinutes() / 5) * 5);
      date.setSeconds(0);
      date.setMilliseconds(0);
      const timeKey = date.toISOString();
      
      if (!grouped[timeKey]) {
        grouped[timeKey] = { timestamp: date.getTime() };
      }
      
      // Keep latest value for each provider at this time
      grouped[timeKey][point.provider] = point.latency_ms;
    }

    return Object.values(grouped)
      .sort((a, b) => (a.timestamp as number) - (b.timestamp as number))
      .slice(-100); // Last 100 data points
  }, [latencyHistory]);

  const enabledProviders = providers.filter(p => p.is_enabled).map(p => p.provider);

  if (isLoading) {
    return (
      <Card className="p-6 bg-card/50 border-border/50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity className="h-5 w-5 animate-pulse" />
          <span>Loading latency trends...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-card/50 border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">24-Hour Latency Trends</h3>
          <Badge variant="outline" className="text-xs">
            {latencyHistory.length} data points
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Provider Toggle Legend */}
      <div className="flex flex-wrap gap-3 mb-4">
        {enabledProviders.map(provider => (
          <label
            key={provider}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Checkbox
              checked={visibleProviders.has(provider)}
              onCheckedChange={() => toggleProvider(provider)}
              style={{ 
                borderColor: PROVIDER_COLORS[provider],
                backgroundColor: visibleProviders.has(provider) ? PROVIDER_COLORS[provider] : 'transparent'
              }}
            />
            <span className="text-sm flex items-center gap-1">
              <span>{PROVIDER_ICONS[provider]}</span>
              <span className="capitalize">{provider}</span>
            </span>
          </label>
        ))}
      </div>

      {/* Chart */}
      <div className="h-[250px]">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid {...chartStyles.grid} />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(ts) => format(new Date(ts), 'HH:mm')}
                {...chartStyles.xAxis}
                tick={{ ...chartStyles.tick, fontSize: 11 }}
              />
              <YAxis
                domain={[0, 300]}
                tickFormatter={(v) => `${v}ms`}
                {...chartStyles.yAxis}
                tick={{ ...chartStyles.tick, fontSize: 11 }}
                width={50}
              />
              <Tooltip
                contentStyle={chartStyles.tooltip.contentStyle}
                labelFormatter={(ts) => format(new Date(ts as number), 'MMM d, HH:mm')}
                formatter={(value: number, name: string) => [
                  `${value}ms`,
                  `${PROVIDER_ICONS[name] || ''} ${name}`
                ]}
              />
              <ReferenceLine
                y={LATENCY_THRESHOLD}
                stroke="hsl(var(--destructive))"
                strokeDasharray="5 5"
                label={{
                  value: `${LATENCY_THRESHOLD}ms threshold`,
                  position: 'right',
                  fill: 'hsl(var(--destructive))',
                  fontSize: 10,
                }}
              />
              {enabledProviders.map(provider => (
                visibleProviders.has(provider) && (
                  <Line
                    key={provider}
                    type="monotone"
                    dataKey={provider}
                    stroke={PROVIDER_COLORS[provider]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                )
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p>No latency data available yet. Deploy VPS nodes to see trends.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/50 mt-4">
        <span>Auto-failover triggers at {LATENCY_THRESHOLD}ms for 30 seconds</span>
        <span className="text-destructive">— Threshold line</span>
      </div>
    </Card>
  );
}
