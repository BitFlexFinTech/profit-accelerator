import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Cpu, HardDrive, Network, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricsChartProps {
  provider: string;
  className?: string;
}

type TimeRange = '1h' | '6h' | '24h' | '7d';

interface MetricPoint {
  time: string;
  cpu: number | null;
  ram: number | null;
  disk: number | null;
  network_in: number | null;
  network_out: number | null;
}

const TIME_RANGES: { value: TimeRange; label: string; hours: number }[] = [
  { value: '1h', label: '1H', hours: 1 },
  { value: '6h', label: '6H', hours: 6 },
  { value: '24h', label: '24H', hours: 24 },
  { value: '7d', label: '7D', hours: 168 },
];

export function MetricsChart({ provider, className }: MetricsChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('6h');
  const [data, setData] = useState<MetricPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeMetrics, setActiveMetrics] = useState({
    cpu: true,
    ram: true,
    disk: false,
    network: false,
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      setIsLoading(true);
      const hours = TIME_RANGES.find(t => t.value === timeRange)?.hours || 6;
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

      const { data: metrics, error } = await supabase
        .from('vps_metrics')
        .select('*')
        .eq('provider', provider)
        .gte('recorded_at', startTime.toISOString())
        .order('recorded_at', { ascending: true });

      if (!error && metrics) {
        const formatted = metrics.map(m => ({
          time: new Date(m.recorded_at!).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            ...(timeRange === '7d' ? { day: '2-digit', month: 'short' } : {}),
          }),
          cpu: m.cpu_percent,
          ram: m.ram_percent,
          disk: m.disk_percent,
          network_in: m.network_in_mbps,
          network_out: m.network_out_mbps,
        }));
        setData(formatted);
      }
      setIsLoading(false);
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [provider, timeRange]);

  const toggleMetric = (metric: keyof typeof activeMetrics) => {
    setActiveMetrics(prev => ({ ...prev, [metric]: !prev[metric] }));
  };

  if (isLoading && data.length === 0) {
    return (
      <Card className={cn("p-4 bg-secondary/30", className)}>
        <div className="h-[200px] flex items-center justify-center">
          <Activity className="h-8 w-8 text-muted-foreground animate-pulse" />
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className={cn("p-4 bg-secondary/30", className)}>
        <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground">
          <Activity className="h-8 w-8 mb-2" />
          <p className="text-sm">No metrics data available</p>
          <p className="text-xs">Data will appear once the instance reports metrics</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("p-4 bg-secondary/30", className)}>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium">Metrics History</h4>
        <div className="flex items-center gap-1">
          {TIME_RANGES.map(range => (
            <Button
              key={range.value}
              variant={timeRange === range.value ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setTimeRange(range.value)}
            >
              {range.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Metric Toggles */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Button
          variant={activeMetrics.cpu ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => toggleMetric('cpu')}
        >
          <Cpu className="h-3 w-3 mr-1" />
          CPU
        </Button>
        <Button
          variant={activeMetrics.ram ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => toggleMetric('ram')}
        >
          <HardDrive className="h-3 w-3 mr-1" />
          RAM
        </Button>
        <Button
          variant={activeMetrics.disk ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => toggleMetric('disk')}
        >
          <HardDrive className="h-3 w-3 mr-1" />
          Disk
        </Button>
        <Button
          variant={activeMetrics.network ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => toggleMetric('network')}
        >
          <Network className="h-3 w-3 mr-1" />
          Network
        </Button>
      </div>

      {/* Chart */}
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              domain={[0, 100]}
              unit="%"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
            />
            {activeMetrics.cpu && (
              <Line
                type="monotone"
                dataKey="cpu"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                name="CPU %"
              />
            )}
            {activeMetrics.ram && (
              <Line
                type="monotone"
                dataKey="ram"
                stroke="hsl(var(--success))"
                strokeWidth={2}
                dot={false}
                name="RAM %"
              />
            )}
            {activeMetrics.disk && (
              <Line
                type="monotone"
                dataKey="disk"
                stroke="hsl(var(--warning))"
                strokeWidth={2}
                dot={false}
                name="Disk %"
              />
            )}
            {activeMetrics.network && (
              <>
                <Line
                  type="monotone"
                  dataKey="network_in"
                  stroke="hsl(var(--accent))"
                  strokeWidth={2}
                  dot={false}
                  name="Net In Mbps"
                />
                <Line
                  type="monotone"
                  dataKey="network_out"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  dot={false}
                  name="Net Out Mbps"
                />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
