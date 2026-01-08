import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { useBalanceHistory } from '@/hooks/useBalanceHistory';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

type TimeRange = '1H' | '24H' | '7D' | '30D';

interface EquityChartPanelProps {
  compact?: boolean;
}

export function EquityChartPanel({ compact = false }: EquityChartPanelProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('24H');
  const { history, loading, currentBalance, percentChange, refetch } = useBalanceHistory(timeRange);

  const chartData = history.map(snapshot => ({
    time: new Date(snapshot.snapshot_time).getTime(),
    balance: snapshot.total_balance,
    label: format(new Date(snapshot.snapshot_time), 
      timeRange === '1H' ? 'HH:mm' : 
      timeRange === '24H' ? 'HH:mm' : 
      'MMM dd'
    )
  }));

  const isPositive = percentChange >= 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatTooltipValue = (value: number) => formatCurrency(value);

  const chartHeight = compact ? 50 : 200;

  return (
    <Card className="h-full bg-card/50 border-border/50 backdrop-blur-sm flex flex-col">
      <CardHeader className={compact ? "p-2 pb-1" : "pb-2"}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className={`${compact ? 'text-sm' : 'text-lg'} font-medium text-foreground`}>
              Total Equity
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <span className={`${compact ? 'text-lg' : 'text-2xl'} font-bold text-foreground`}>
                {formatCurrency(currentBalance)}
              </span>
              <div className={`flex items-center gap-0.5 ${compact ? 'text-xs' : 'text-sm'} font-medium ${
                isPositive ? 'text-green-500' : 'text-red-500'
              }`}>
                {isPositive ? <TrendingUp className={compact ? "h-3 w-3" : "h-4 w-4"} /> : <TrendingDown className={compact ? "h-3 w-3" : "h-4 w-4"} />}
                <span>{isPositive ? '+' : ''}{percentChange.toFixed(2)}%</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {(['1H', '24H', '7D', '30D'] as TimeRange[]).map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTimeRange(range)}
                className={`${compact ? 'h-5 px-1.5 text-[10px]' : 'text-xs h-7 px-2'}`}
              >
                {range}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className={compact ? "h-5 w-5 p-0" : "h-7 w-7 p-0"}
            >
              <RefreshCw className={compact ? "h-3 w-3" : "h-4 w-4"} />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className={`${compact ? 'p-2 pt-0' : 'pt-0'} flex-1 min-h-0`}>
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                </linearGradient>
              </defs>
              {!compact && (
                <XAxis 
                  dataKey="label" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  interval="preserveStartEnd"
                />
              )}
              {!compact && (
                <YAxis 
                  domain={['dataMin - 50', 'dataMax + 50']}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(1)}k`}
                  width={50}
                />
              )}
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value: number) => [formatTooltipValue(value), 'Balance']}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="balance"
                stroke={isPositive ? '#22c55e' : '#ef4444'}
                strokeWidth={2}
                fill="url(#equityGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
