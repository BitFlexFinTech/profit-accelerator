import { useEffect } from 'react';
import { UnifiedControlBar } from '../panels/UnifiedControlBar';
import { CompactMetricsBar } from '../panels/CompactMetricsBar';
import { EquityChartPanel } from '../panels/EquityChartPanel';
import { TradeActivityTerminal } from '../panels/TradeActivityTerminal';
import { AIMarketUpdatesPanel } from '../panels/AIMarketUpdatesPanel';
import { MarketWatchPanel } from '../panels/MarketWatchPanel';
import { CloudStatusPanel } from '../panels/CloudStatusPanel';
import { ExchangePulsePanel } from '../panels/ExchangePulsePanel';
import { RateLimitMonitorPanel } from '../panels/RateLimitMonitorPanel';
import { SentimentPanel } from '../panels/SentimentPanel';
import { useTradeNotifications } from '@/hooks/useTradeNotifications';
import { useExchangeWebSocket } from '@/hooks/useExchangeWebSocket';
import { useLiveBalancePolling } from '@/hooks/useLiveBalancePolling';

export function LiveDashboard() {
  useTradeNotifications();
  const { sync } = useExchangeWebSocket();
  const { startPolling, stopPolling } = useLiveBalancePolling(30);

  useEffect(() => {
    sync();
    startPolling();
    return () => stopPolling();
  }, [sync, startPolling, stopPolling]);

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col gap-2 p-2 overflow-hidden">
      {/* Top Control Bar - Merged Bot Status + Quick Actions */}
      <UnifiedControlBar />
      
      {/* Compact Metrics Bar */}
      <CompactMetricsBar />
      
      {/* Main 3-Column Grid - No Scroll */}
      <div className="flex-1 grid grid-cols-[30%_40%_30%] gap-2 min-h-0">
        {/* LEFT Column - Trade Activity Terminal (SWAPPED - Full Height) */}
        <div className="min-h-0">
          <TradeActivityTerminal expanded />
        </div>
        
        {/* CENTER Column - AI Market Analysis (SWAPPED - Full Height) */}
        <div className="min-h-0">
          <AIMarketUpdatesPanel fullHeight />
        </div>
        
        {/* RIGHT Column - Stacked Compact Panels */}
        <div className="flex flex-col gap-1.5 min-h-0">
          <div className="h-[120px] flex-shrink-0">
            <EquityChartPanel compact />
          </div>
          <div className="h-[100px] flex-shrink-0">
            <MarketWatchPanel compact limit={2} />
          </div>
          <div className="h-[80px] flex-shrink-0">
            <CloudStatusPanel compact />
          </div>
          <div className="h-[75px] flex-shrink-0">
            <ExchangePulsePanel compact />
          </div>
          <div className="h-[70px] flex-shrink-0">
            <RateLimitMonitorPanel compact />
          </div>
          <div className="flex-1 min-h-0">
            <SentimentPanel compact />
          </div>
        </div>
      </div>
    </div>
  );
}