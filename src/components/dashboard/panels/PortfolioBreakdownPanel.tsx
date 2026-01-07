import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';

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
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <PieChartIcon className="h-4 w-4 text-primary" />
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
                        className="transition-all duration-500"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Balance']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
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
                  className="flex items-center justify-between text-xs transition-all duration-300 hover:bg-secondary/30 rounded px-1 -mx-1"
                >
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full transition-transform duration-300 hover:scale-125" 
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
              <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Total Equity</span>
                <span className="font-mono font-bold text-primary transition-all duration-500">
                  ${totalEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
            No exchange balances to display
          </div>
        )}
      </CardContent>
    </Card>
  );
}
