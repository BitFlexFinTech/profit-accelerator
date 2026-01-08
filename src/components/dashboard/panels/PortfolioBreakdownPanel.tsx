import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';
import { IconContainer } from '@/components/ui/IconContainer';
import { cn } from '@/lib/utils';

export function PortfolioBreakdownPanel() {
  const { getPortfolioBreakdown, getTotalEquity } = useAppStore();
  const breakdown = getPortfolioBreakdown();
  const totalEquity = getTotalEquity();

  // Transform for Recharts
  const chartData = breakdown.map(item => ({
    name: item.exchange,
    value: item.balance,
    percentage: item.percentage,
    color: item.color
  }));

  const hasData = chartData.length > 0 && totalEquity > 0;

  return (
    <Card className={cn(
      "card-teal bg-card/50 backdrop-blur-sm overflow-hidden",
      "hover:shadow-lg hover:shadow-teal-500/10 transition-all duration-300"
    )}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <IconContainer color="teal" size="sm" animated>
            <PieChartIcon className="h-3.5 w-3.5" />
          </IconContainer>
          Portfolio Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="flex items-center gap-4">
            {/* Animated Pie Chart */}
            <div className="w-32 h-32 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={50}
                    paddingAngle={2}
                    dataKey="value"
                    animationBegin={0}
                    animationDuration={800}
                    animationEasing="ease-out"
                    isAnimationActive={true}
                  >
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                        className="transition-all duration-500 hover:opacity-80"
                        stroke="hsl(var(--background))"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Balance']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(174, 100%, 42%, 0.3)',
                      borderRadius: '6px',
                      fontSize: '12px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Animated Legend */}
            <div className="flex-1 space-y-1.5">
              {chartData.map((entry) => (
                <div 
                  key={entry.name} 
                  className={cn(
                    "flex items-center justify-between text-xs transition-all duration-300",
                    "hover:bg-teal-500/10 rounded px-1 -mx-1"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full transition-transform duration-300 hover:scale-125 ring-1 ring-white/10" 
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-muted-foreground">{entry.name}</span>
                  </div>
                  <span className="font-mono font-medium transition-colors duration-300">
                    {entry.percentage.toFixed(1)}%
                  </span>
                </div>
              ))}
              
              {/* Total */}
              <div className="pt-2 border-t border-teal-500/20 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Total Equity</span>
                <span className="font-mono font-bold text-teal-400 transition-all duration-500">
                  ${totalEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-32 flex flex-col items-center justify-center text-muted-foreground text-sm">
            <div className="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center mb-2">
              <PieChartIcon className="w-5 h-5 text-teal-500/50" />
            </div>
            <p>No exchange balances to display</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
