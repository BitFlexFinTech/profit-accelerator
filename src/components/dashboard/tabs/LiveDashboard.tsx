import { useEffect } from 'react';
import { UnifiedControlBar } from '../panels/UnifiedControlBar';
import { CompactMetricsBar } from '../panels/CompactMetricsBar';
import { TradeActivityTerminal } from '../panels/TradeActivityTerminal';
import { AIMarketUpdatesPanel } from '../panels/AIMarketUpdatesPanel';
import { ScrollingPriceTicker } from '../panels/ScrollingPriceTicker';
import { NewsPanel } from '../panels/NewsPanel';
import { InfrastructurePanel } from '../panels/InfrastructurePanel';
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
    <div className="h-full flex flex-col gap-1.5 overflow-hidden">
      {/* Scrolling Price Ticker - Very Top */}
      <ScrollingPriceTicker />
      
      {/* Top Control Bar - Merged Bot Status + Quick Actions */}
      <UnifiedControlBar />
      
      {/* Compact Metrics Bar */}
      <CompactMetricsBar />
      
      {/* Main 3-Column Grid - No Scroll */}
      <div className="flex-1 grid grid-cols-[30%_40%_30%] gap-2 min-h-0">
        {/* LEFT Column - AI Market Analysis (Full Height) */}
        <div className="min-h-0">
          <AIMarketUpdatesPanel fullHeight />
        </div>
        
        {/* CENTER Column - Live Trade Activity Terminal (Full Height) */}
        <div className="min-h-0">
          <TradeActivityTerminal expanded />
        </div>
        
        {/* RIGHT Column - News (LONG) + Infrastructure (SMALL) */}
        <div className="flex flex-col gap-1 min-h-0 h-full">
          {/* News Panel - EXPANDED (takes most space) */}
          <div className="flex-1 min-h-0">
            <NewsPanel />
          </div>
          
          {/* Infrastructure Panel - Shows latency (180px fixed) */}
          <div className="h-[180px] flex-shrink-0">
            <InfrastructurePanel />
          </div>
        </div>
      </div>
    </div>
  );
}