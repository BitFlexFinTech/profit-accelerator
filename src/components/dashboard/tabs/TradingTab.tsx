import { OrderForm } from '@/components/trading/OrderForm';
import { PositionsPanel } from '@/components/trading/PositionsPanel';
import { OrderHistory } from '@/components/trading/OrderHistory';
import { RiskDashboardPanel } from '../panels/RiskDashboardPanel';
import { AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useAppStore } from '@/store/useAppStore';

export function TradingTab() {
  const { getTotalEquity, dailyPnl } = useAppStore();
  const totalEquity = getTotalEquity();

  return (
    <div className="space-y-3 animate-fade-in h-full">
      {/* Live Trading Warning Banner - Compact */}
      <div className="px-3 py-2 bg-destructive/20 border border-destructive/30 rounded-lg flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-destructive" />
        <span className="text-sm font-medium text-destructive">LIVE TRADING</span>
        <span className="text-xs text-muted-foreground">- Real funds at risk</span>
      </div>

      {/* Hyperliquid-style 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_300px] gap-3">
        
        {/* LEFT: Portfolio Stats + Risk Dashboard */}
        <div className="space-y-3">
          <Card className="p-4 bg-card/80 border-border/50">
            <div className="text-xs font-medium text-muted-foreground mb-1">Portfolio Value</div>
            <div className="text-2xl font-bold text-primary">
              ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className={`flex items-center gap-1 text-sm mt-1 ${dailyPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {dailyPnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span className="font-medium">{dailyPnl >= 0 ? '+' : ''}{dailyPnl.toFixed(2)}</span>
              <span className="text-xs text-muted-foreground">today</span>
            </div>
          </Card>
          <RiskDashboardPanel />
        </div>

        {/* CENTER: Positions + Order History (main area) */}
        <div className="space-y-3 min-w-0">
          <PositionsPanel />
          <OrderHistory />
        </div>

        {/* RIGHT: Compact Order Form */}
        <div className="h-full">
          <OrderForm />
        </div>
      </div>
    </div>
  );
}
