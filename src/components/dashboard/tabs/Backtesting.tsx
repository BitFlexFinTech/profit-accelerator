import { Play, Calendar, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function Backtesting() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Backtesting Simulator</h2>
      </div>

      {/* Configuration Panel */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4">Backtest Configuration</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Strategy</label>
            <select className="w-full h-10 rounded-lg bg-secondary/50 border border-border px-3">
              <option>Momentum Scalper</option>
              <option>Mean Reversion</option>
            </select>
          </div>
          
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Start Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input type="date" className="pl-10 bg-secondary/50" defaultValue="2024-01-01" />
            </div>
          </div>
          
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">End Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input type="date" className="pl-10 bg-secondary/50" defaultValue="2024-12-31" />
            </div>
          </div>
          
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Initial Balance</label>
            <Input type="number" className="bg-secondary/50" defaultValue="10000" />
          </div>
        </div>

        <Button className="gap-2">
          <Play className="w-4 h-4" />
          Run Backtest
        </Button>
      </div>

      {/* Results */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4">Results</h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-secondary/30">
            <p className="text-sm text-muted-foreground">Final Balance</p>
            <p className="text-xl font-bold text-success">$15,234</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary/30">
            <p className="text-sm text-muted-foreground">Total Return</p>
            <p className="text-xl font-bold text-success">+52.3%</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary/30">
            <p className="text-sm text-muted-foreground">Total Trades</p>
            <p className="text-xl font-bold">847</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary/30">
            <p className="text-sm text-muted-foreground">Win Rate</p>
            <p className="text-xl font-bold">68.2%</p>
          </div>
        </div>

        {/* Chart Placeholder */}
        <div className="h-64 rounded-lg bg-secondary/20 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Equity curve will be displayed here</p>
          </div>
        </div>
      </div>
    </div>
  );
}
