import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, RefreshCw, LineChart } from 'lucide-react';
import { useBalanceHistory } from '@/hooks/useBalanceHistory';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IconContainer } from '@/components/ui/IconContainer';

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
    <Card className={cn(
      "card-yellow h-full bg-card/50 backdrop-blur-sm flex flex-col overflow-hidden",
      "hover:shadow-lg hover:shadow-yellow-500/10 transition-all duration-300"
    )}>
      <CardHeader className={compact ? "p-2 pb-1" : "pb-2"}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconContainer color="yellow" size="sm">
              <LineChart className="h-3.5 w-3.5" />
            </IconContainer>
            <CardTitle className={cn("font-medium text-foreground", compact ? 'text-sm' : 'text-lg')}>
              Total Equity
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <span className={cn("font-bold text-foreground", compact ? 'text-lg' : 'text-2xl')}>
                {formatCurrency(currentBalance)}
              </span>
              <div className={cn(
                "flex items-center gap-0.5 font-medium",
                compact ? 'text-xs' : 'text-sm',
                isPositive ? 'text-green-400' : 'text-red-400'
              )}>
                {isPositive ? (
                  <TrendingUp className={compact ? "h-3 w-3" : "h-4 w-4"} />
                ) : (
                  <TrendingDown className={compact ? "h-3 w-3" : "h-4 w-4"} />
                )}
                <span>{isPositive ? '+' : ''}{percentChange.toFixed(2)}%</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {(['1H', '24H', '7D', '30D'] as TimeRange[]).map((range) => (
              <UITooltip key={range}>
                <TooltipTrigger asChild>
                  <Button
                    variant={timeRange === range ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setTimeRange(range)}
                    className={cn(
                      compact ? 'h-5 px-1.5 text-[10px]' : 'text-xs h-7 px-2',
                      timeRange === range && 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                    )}
                  >
                    {range}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Show {range} price history</TooltipContent>
              </UITooltip>
            ))}
            <UITooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetch()}
                  className={compact ? "h-5 w-5 p-0" : "h-7 w-7 p-0"}
                >
                  <RefreshCw className={compact ? "h-3 w-3" : "h-4 w-4"} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh equity chart data</TooltipContent>
            </UITooltip>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className={cn("flex-1 min-h-0", compact ? 'p-2 pt-0' : 'pt-0')}>
        {loading ? (
          <Skeleton className="h-full w-full bg-yellow-500/10" />
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="equityGradientYellow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? '#facc15' : '#ef4444'} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={isPositive ? '#facc15' : '#ef4444'} stopOpacity={0} />
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
                  border: '1px solid hsl(48, 96%, 53%, 0.3)',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value: number) => [formatTooltipValue(value), 'Balance']}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="balance"
                stroke={isPositive ? '#facc15' : '#ef4444'}
                strokeWidth={2}
                fill="url(#equityGradientYellow)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
