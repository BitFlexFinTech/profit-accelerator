import { TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react';

export function PnLPanel() {
  return (
    <>
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Today's P&L</span>
          <DollarSign className="w-4 h-4 text-success" />
        </div>
        <p className="text-2xl font-bold text-success">+$347.82</p>
        <div className="flex items-center gap-1 mt-1">
          <TrendingUp className="w-3 h-3 text-success" />
          <span className="text-xs text-success">+2.34%</span>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Weekly P&L</span>
          <DollarSign className="w-4 h-4 text-success" />
        </div>
        <p className="text-2xl font-bold text-success">+$1,234.56</p>
        <div className="flex items-center gap-1 mt-1">
          <TrendingUp className="w-3 h-3 text-success" />
          <span className="text-xs text-success">+8.12%</span>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Total Balance</span>
          <DollarSign className="w-4 h-4 text-primary" />
        </div>
        <p className="text-2xl font-bold">$15,234.78</p>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs text-muted-foreground">Across 6 exchanges</span>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Active Trades</span>
          <Activity className="w-4 h-4 text-accent" />
        </div>
        <p className="text-2xl font-bold">3</p>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs text-accent">$1,050 at risk</span>
        </div>
      </div>
    </>
  );
}
