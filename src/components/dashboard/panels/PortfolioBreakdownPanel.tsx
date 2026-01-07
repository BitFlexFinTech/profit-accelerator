import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';

const EXCHANGE_COLORS: Record<string, string> = {
  Binance: '#F0B90B',
  OKX: '#6366F1',
  Bybit: '#F97316',
  Bitget: '#22C55E',
  MEXC: '#3B82F6',
  'Gate.io': '#8B5CF6',
  KuCoin: '#06B6D4',
  Kraken: '#A855F7',
  BingX: '#EC4899',
  Hyperliquid: '#14B8A6',
  Nexo: '#10B981'
};

const DEFAULT_COLOR = '#64748B';

export function PortfolioBreakdownPanel() {
  const { exchangeBalances, getTotalEquity } = useAppStore();
  const totalEquity = getTotalEquity();

  // Build pie chart data from connected exchanges with balances
  const chartData = Object.entries(exchangeBalances)
    .filter(([_, balance]) => balance.isConnected && balance.total > 0)
    .map(([exchange, balance]) => ({
      name: exchange,
      value: balance.total,
      percentage: totalEquity > 0 ? (balance.total / totalEquity) * 100 : 0,
      color: EXCHANGE_COLORS[exchange] || DEFAULT_COLOR
    }))
    .sort((a, b) => b.value - a.value);

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
            {/* Pie Chart */}
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
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
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

            {/* Legend */}
            <div className="flex-1 space-y-1.5">
              {chartData.map((entry) => (
                <div key={entry.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-muted-foreground">{entry.name}</span>
                  </div>
                  <span className="font-mono font-medium">
                    {entry.percentage.toFixed(1)}%
                  </span>
                </div>
              ))}
              
              {/* Total */}
              <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Total Equity</span>
                <span className="font-mono font-bold text-primary">
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
