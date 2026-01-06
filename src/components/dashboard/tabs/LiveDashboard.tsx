import { SentimentPanel } from '../panels/SentimentPanel';
import { TradeCopierPanel } from '../panels/TradeCopierPanel';
import { ExchangePingPanel } from '../panels/ExchangePingPanel';
import { PnLPanel } from '../panels/PnLPanel';
import { RecentTradesPanel } from '../panels/RecentTradesPanel';
import { QuickActionsPanel } from '../panels/QuickActionsPanel';
import { MarketWatchPanel } from '../panels/MarketWatchPanel';
import { useTradeNotifications } from '@/hooks/useTradeNotifications';

export function LiveDashboard() {
  // Subscribe to real-time trade notifications
  useTradeNotifications();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Row - Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <PnLPanel />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          <MarketWatchPanel />
          <QuickActionsPanel />
        </div>

        {/* Center Column */}
        <div className="lg:col-span-1 space-y-6">
          <SentimentPanel />
          <RecentTradesPanel />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <ExchangePingPanel />
          <TradeCopierPanel />
        </div>
      </div>
    </div>
  );
}
