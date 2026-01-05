import { Copy, ArrowRight, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function TradeCopierPanel() {
  const isActive = true;
  const masterExchange = 'Bybit';
  const mirrorExchanges = ['OKX', 'Bitget', 'BingX'];

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Copy className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Trade Copier</h3>
        </div>
        <div className="flex items-center gap-2">
          {isActive ? (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-success/20">
              <div className="status-online" />
              <span className="text-xs text-success font-medium">Active</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted">
              <div className="status-offline" />
              <span className="text-xs text-muted-foreground font-medium">Inactive</span>
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Copy Flow Visualization */}
      <div className="flex items-center justify-center gap-3 mb-4 py-4">
        <div className="p-3 rounded-lg bg-accent/20 border border-accent/30">
          <p className="text-xs text-muted-foreground mb-1">Master</p>
          <p className="font-bold text-accent">{masterExchange}</p>
        </div>
        
        <div className="flex items-center gap-1 text-muted-foreground">
          <ArrowRight className="w-4 h-4" />
          <ArrowRight className="w-4 h-4 -ml-2" />
        </div>

        <div className="flex flex-wrap gap-2">
          {mirrorExchanges.map((exchange) => (
            <div key={exchange} className="p-2 rounded-lg bg-secondary/50 border border-border">
              <p className="text-sm font-medium">{exchange}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-secondary/30 text-center">
          <p className="text-2xl font-bold">24</p>
          <p className="text-xs text-muted-foreground">Copies Today</p>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30 text-center">
          <p className="text-2xl font-bold text-success">98%</p>
          <p className="text-xs text-muted-foreground">Success Rate</p>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30 text-center">
          <p className="text-2xl font-bold">12ms</p>
          <p className="text-xs text-muted-foreground">Avg Delay</p>
        </div>
      </div>
    </div>
  );
}
