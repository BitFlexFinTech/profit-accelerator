import { Plus, Play, Pause, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function StrategyBuilder() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Strategy Builder</h2>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          New Strategy
        </Button>
      </div>

      {/* Strategy Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="glass-card-hover p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold">Momentum Scalper</h3>
              <p className="text-sm text-muted-foreground">RSI + Volume breakout</p>
            </div>
            <div className="flex items-center gap-1">
              <div className="status-online" />
              <span className="text-xs text-success">Active</span>
            </div>
          </div>
          
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Win Rate</span>
              <span className="font-medium">72%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Trades Today</span>
              <span className="font-medium">14</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">P&L Today</span>
              <span className="font-medium text-success">+$234.50</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1">
              <Pause className="w-3 h-3" />
              Pause
            </Button>
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <div className="glass-card-hover p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold">Mean Reversion</h3>
              <p className="text-sm text-muted-foreground">Bollinger Band bounces</p>
            </div>
            <div className="flex items-center gap-1">
              <div className="status-warning" />
              <span className="text-xs text-warning">Paused</span>
            </div>
          </div>
          
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Win Rate</span>
              <span className="font-medium">65%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Trades Today</span>
              <span className="font-medium">0</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">P&L Today</span>
              <span className="font-medium">$0.00</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1 text-success hover:text-success">
              <Play className="w-3 h-3" />
              Start
            </Button>
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Add New Strategy Card */}
        <div className="glass-card border-dashed p-6 flex flex-col items-center justify-center text-center min-h-[200px] hover:border-primary/50 transition-colors cursor-pointer">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-3">
            <Plus className="w-6 h-6 text-primary" />
          </div>
          <p className="font-medium">Create New Strategy</p>
          <p className="text-sm text-muted-foreground">Visual no-code builder</p>
        </div>
      </div>
    </div>
  );
}
