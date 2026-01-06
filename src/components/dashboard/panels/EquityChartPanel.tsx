import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { useBalanceHistory } from '@/hooks/useBalanceHistory';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

type TimeRange = '1H' | '24H' | '7D' | '30D';

export function EquityChartPanel() {
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

  return (
    <Card className="bg-card/50 border-border/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CardTitle className="text-lg font-medium text-foreground">
              Total Equity
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-foreground">
                {formatCurrency(currentBalance)}
              </span>
              <div className={`flex items-center gap-1 text-sm font-medium ${
                isPositive ? 'text-green-500' : 'text-red-500'
              }`}>
                {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                <span>{isPositive ? '+' : ''}{percentChange.toFixed(2)}%</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {(['1H', '24H', '7D', '30D'] as TimeRange[]).map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeRange(range)}
                className="text-xs h-7 px-2"
              >
                {range}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {loading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : chartData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No data available for this time range
          </div>
        ) : (
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="label" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  domain={['dataMin - 50', 'dataMax + 50']}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(1)}k`}
                  width={50}
                />
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
