import { useEffect } from 'react';
import { BotControlPanel } from '../BotControlPanel';
import { CompactMetricsBar } from '../panels/CompactMetricsBar';
import { EquityChartPanel } from '../panels/EquityChartPanel';
import { TradeActivityTerminal } from '../panels/TradeActivityTerminal';
import { CloudStatusPanel } from '../panels/CloudStatusPanel';
import { SentimentPanel } from '../panels/SentimentPanel';
import { AIMarketUpdatesPanel } from '../panels/AIMarketUpdatesPanel';
import { RateLimitMonitorPanel } from '../panels/RateLimitMonitorPanel';
import { MarketWatchPanel } from '../panels/MarketWatchPanel';
import { QuickActionsPanel } from '../panels/QuickActionsPanel';
import { RiskDashboardPanel } from '../panels/RiskDashboardPanel';
import { ExchangeConnectionsCard } from '../panels/ExchangeConnectionsCard';
import { ExchangePulsePanel } from '../panels/ExchangePulsePanel';
import { useTradeNotifications } from '@/hooks/useTradeNotifications';
import { useExchangeWebSocket } from '@/hooks/useExchangeWebSocket';
import { useLiveBalancePolling } from '@/hooks/useLiveBalancePolling';

export function LiveDashboard() {
  useTradeNotifications();
  const { sync } = useExchangeWebSocket();
  const { startPolling, stopPolling } = useLiveBalancePolling(30); // Poll every 30 seconds

  useEffect(() => {
    sync();
    startPolling(); // Start CCXT-based comprehensive balance polling
    
    return () => {
      stopPolling();
    };
  }, [sync, startPolling, stopPolling]);

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col gap-3 overflow-hidden animate-fade-in">
      {/* Bot Control Panel */}
      <div className="flex-shrink-0">
        <BotControlPanel />
      </div>

      {/* Key Metrics Row */}
      <div className="flex-shrink-0">
        <CompactMetricsBar />
      </div>

      {/* Main Content Area - 50/50 split for larger AI panel */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-0">
        {/* Left Column: Equity + Trade Activity + Quick Actions */}
        <div className="flex flex-col gap-3 min-h-0">
          <div className="flex-shrink-0">
            <EquityChartPanel />
          </div>
          <div className="flex-1 min-h-0">
            <TradeActivityTerminal />
          </div>
          <div className="flex-shrink-0">
            <QuickActionsPanel />
          </div>
          <div className="flex-shrink-0">
            <ExchangePulsePanel />
          </div>
        </div>

        {/* Right Column: AI Panel (MUCH BIGGER) + Supporting panels */}
        <div className="flex flex-col gap-3 min-h-0">
          {/* AI Market Updates - Takes primary space (50% of right column) */}
          <div className="flex-1 min-h-[300px]">
            <AIMarketUpdatesPanel />
          </div>

          {/* Market Watch Panel */}
          <div className="flex-shrink-0">
            <MarketWatchPanel />
          </div>

          {/* Rate Limit Monitor - Real-time API usage */}
          <div className="flex-shrink-0">
            <RateLimitMonitorPanel />
          </div>

          {/* Exchange Connections Card */}
          <div className="flex-shrink-0">
            <ExchangeConnectionsCard />
          </div>

          {/* Cloud Status - Compact row */}
          <div className="flex-shrink-0">
            <CloudStatusPanel />
          </div>

          {/* Risk Dashboard */}
          <div className="flex-shrink-0">
            <RiskDashboardPanel />
          </div>

          {/* Sentiment Panel */}
          <div className="flex-shrink-0">
            <SentimentPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
