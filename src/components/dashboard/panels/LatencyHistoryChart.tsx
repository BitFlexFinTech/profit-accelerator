import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, Activity, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface HistoryPoint {
  time: string;
  latency: number;
  timestamp: Date;
}

const EXCHANGES = [
  { value: 'binance', label: 'Binance' },
  { value: 'okx', label: 'OKX' },
  { value: 'bybit', label: 'Bybit' },
  { value: 'bitget', label: 'Bitget' },
  { value: 'kucoin', label: 'KuCoin' },
  { value: 'hyperliquid', label: 'Hyperliquid' },
  { value: 'mexc', label: 'MEXC' },
  { value: 'gateio', label: 'Gate.io' },
];

export function LatencyHistoryChart() {
  const [selectedExchange, setSelectedExchange] = useState('binance');
  const [data, setData] = useState<HistoryPoint[]>([]);
  const [stats, setStats] = useState({ avg: 0, min: 0, max: 0, trend: 'stable' as 'up' | 'down' | 'stable' });

  useEffect(() => {
    fetchHistory();
  }, [selectedExchange]);

  const fetchHistory = async () => {
    const { data: history } = await supabase
      .from('exchange_latency_history')
      .select('latency_ms, recorded_at')
      .eq('exchange_name', selectedExchange)
      .eq('source', 'vps')
      .order('recorded_at', { ascending: true })
      .limit(50);

    if (!history || history.length === 0) {
      setData([]);
      setStats({ avg: 0, min: 0, max: 0, trend: 'stable' });
      return;
    }

    const points: HistoryPoint[] = history.map(h => ({
      time: format(new Date(h.recorded_at), 'HH:mm'),
      latency: Number(h.latency_ms),
      timestamp: new Date(h.recorded_at)
    }));

    setData(points);

    // Calculate stats with defensive guards for divide-by-zero
    const latencies = points.map(p => p.latency);
    const avg = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const min = latencies.length > 0 ? Math.min(...latencies) : 0;
    const max = latencies.length > 0 ? Math.max(...latencies) : 0;

    // Calculate trend with defensive guards
    const halfIndex = Math.max(1, Math.floor(latencies.length / 2));
    const firstHalf = latencies.slice(0, halfIndex);
    const secondHalf = latencies.slice(halfIndex);
    const firstHalfAvg = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0;
    const secondHalfAvg = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0;
    const trend = firstHalfAvg === 0 ? 'stable' : secondHalfAvg > firstHalfAvg * 1.1 ? 'up' : secondHalfAvg < firstHalfAvg * 0.9 ? 'down' : 'stable';

    setStats({ avg: Math.round(avg), min: Math.round(min), max: Math.round(max), trend });
  };

  const getTrendBadge = () => {
    if (stats.trend === 'up') {
      return (
        <Badge variant="outline" className="gap-1 text-xs border-red-500/50 text-red-400">
          <TrendingUp className="w-3 h-3" />
          Increasing
        </Badge>
      );
    }
    if (stats.trend === 'down') {
      return (
        <Badge variant="outline" className="gap-1 text-xs border-green-500/50 text-green-400">
          <TrendingUp className="w-3 h-3 rotate-180" />
          Improving
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 text-xs border-muted-foreground/50">
        <Activity className="w-3 h-3" />
        Stable
      </Badge>
    );
  };

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Latency History
          </CardTitle>
          <div className="flex items-center gap-2">
            {getTrendBadge()}
            <Select value={selectedExchange} onValueChange={setSelectedExchange}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXCHANGES.map(ex => (
                  <SelectItem key={ex.value} value={ex.value}>{ex.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[150px] flex items-center justify-center text-sm text-muted-foreground">
            No history data for {selectedExchange}. Ping from VPS to start tracking.
          </div>
        ) : (
          <>
            <div className="h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    domain={[0, 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => [`${value}ms`, 'Latency']}
                  />
                  <ReferenceLine y={80} stroke="hsl(var(--destructive))" strokeDasharray="5 5" opacity={0.5} />
                  <ReferenceLine y={30} stroke="hsl(142, 76%, 36%)" strokeDasharray="5 5" opacity={0.5} />
                  <Line 
                    type="monotone" 
                    dataKey="latency" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ r: 2, fill: 'hsl(var(--primary))' }}
                    activeDot={{ r: 4, fill: 'hsl(var(--primary))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="p-2 rounded bg-secondary/30 text-center">
                <p className="text-[10px] text-muted-foreground">Avg</p>
                <p className={`text-sm font-bold ${stats.avg < 30 ? 'text-green-400' : stats.avg < 80 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {stats.avg}ms
                </p>
              </div>
              <div className="p-2 rounded bg-secondary/30 text-center">
                <p className="text-[10px] text-muted-foreground">Min</p>
                <p className="text-sm font-bold text-green-400">{stats.min}ms</p>
              </div>
              <div className="p-2 rounded bg-secondary/30 text-center">
                <p className="text-[10px] text-muted-foreground">Max</p>
                <p className={`text-sm font-bold ${stats.max < 80 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {stats.max}ms
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}