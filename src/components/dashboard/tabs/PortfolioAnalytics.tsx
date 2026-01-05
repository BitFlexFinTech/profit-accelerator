import { TrendingUp, TrendingDown, Activity, Target } from 'lucide-react';

export function PortfolioAnalytics() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Portfolio Analytics</h2>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sharpe Ratio</p>
              <p className="text-xl font-bold text-success">2.34</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Max Drawdown</p>
              <p className="text-xl font-bold text-destructive">-12.4%</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Win Rate</p>
              <p className="text-xl font-bold">67.8%</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Target className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Profit Factor</p>
              <p className="text-xl font-bold">1.89</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts placeholder */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4">Equity Curve</h3>
        <div className="h-64 flex items-center justify-center text-muted-foreground">
          <p>Chart will be rendered here with real data</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold mb-4">Monthly Returns</h3>
          <div className="h-48 flex items-center justify-center text-muted-foreground">
            <p>Monthly heatmap will appear here</p>
          </div>
        </div>

        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold mb-4">Trade Distribution</h3>
          <div className="h-48 flex items-center justify-center text-muted-foreground">
            <p>Distribution chart will appear here</p>
          </div>
        </div>
      </div>
    </div>
  );
}
