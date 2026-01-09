import { OrderForm } from '@/components/trading/OrderForm';
import { PositionsPanel } from '@/components/trading/PositionsPanel';
import { OrderHistory } from '@/components/trading/OrderHistory';
import { RiskDashboardPanel } from '../panels/RiskDashboardPanel';
import { AlertTriangle } from 'lucide-react';

export function TradingTab() {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Live Trading Warning Banner */}
      <div className="px-4 py-3 bg-destructive/20 border border-destructive/30 rounded-lg flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-destructive" />
        <span className="font-medium text-destructive">
          Live Trading Mode
        </span>
        <span className="text-sm text-muted-foreground">
          - All orders execute with real funds on connected exchanges
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column: Order Form + Risk */}
        <div className="space-y-4">
          <OrderForm />
          <RiskDashboardPanel />
        </div>

        {/* Right Column: Positions and History */}
        <div className="lg:col-span-2 space-y-4">
          <PositionsPanel />
          <OrderHistory />
        </div>
      </div>
    </div>
  );
}
