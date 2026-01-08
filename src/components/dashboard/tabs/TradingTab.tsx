import { OrderForm } from '@/components/trading/OrderForm';
import { PositionsPanel } from '@/components/trading/PositionsPanel';
import { OrderHistory } from '@/components/trading/OrderHistory';
import { RiskDashboardPanel } from '../panels/RiskDashboardPanel';
import { useAppStore } from '@/store/useAppStore';
import { FlaskConical } from 'lucide-react';

export function TradingTab() {
  const paperTradingMode = useAppStore(state => state.paperTradingMode);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Paper Trading Banner */}
      {paperTradingMode && (
        <div className="px-4 py-3 bg-primary/20 border border-primary/30 rounded-lg flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-primary" />
          <span className="font-medium text-primary">
            Paper Trading Mode Active
          </span>
          <span className="text-sm text-muted-foreground">
            - Orders are simulated using real market data
          </span>
        </div>
      )}

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
