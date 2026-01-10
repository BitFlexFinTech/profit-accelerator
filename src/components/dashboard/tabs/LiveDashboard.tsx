import { useEffect } from 'react';
import { UnifiedControlBar } from '../panels/UnifiedControlBar';
import { CompactMetricsBar } from '../panels/CompactMetricsBar';
import { TradeActivityTerminal } from '../panels/TradeActivityTerminal';
import { AIMarketUpdatesPanel } from '../panels/AIMarketUpdatesPanel';
import { ScrollingPriceTicker } from '../panels/ScrollingPriceTicker';
import { NewsPanel } from '../panels/NewsPanel';
import { InfrastructurePanel } from '../panels/InfrastructurePanel';
import { AIProviderHealthDashboard } from '../panels/AIProviderHealthDashboard';
import { UnderwaterPositionsPanel } from '../panels/UnderwaterPositionsPanel';
// AutoStartWarningBanner removed - bot auto-start is disabled by design
import { useTradeNotifications } from '@/hooks/useTradeNotifications';
import { useExchangeWebSocket } from '@/hooks/useExchangeWebSocket';
import { useLiveBalancePolling } from '@/hooks/useLiveBalancePolling';
import { useRateLimitRecovery } from '@/hooks/useRateLimitRecovery';
import { MobileDashboard } from '../MobileDashboard';
import { useIsMobile } from '@/hooks/use-mobile';
import { useWidgetStore } from '@/store/useWidgetStore';

export function LiveDashboard() {
  useTradeNotifications();
  useRateLimitRecovery(); // Auto-clears expired cooldowns every 5 minutes
  const isMobile = useIsMobile();
  const { sync } = useExchangeWebSocket();
  const { startPolling, stopPolling } = useLiveBalancePolling(60);
  const { getLayout } = useWidgetStore();
  const layout = getLayout('live');

  useEffect(() => {
    sync();
    startPolling();
    return () => stopPolling();
  }, [sync, startPolling, stopPolling]);

  // Helper to check widget visibility
  const isVisible = (id: string) => {
    const widget = layout.find((w) => w.id === id);
    return widget?.visible ?? true;
  };

  // Mobile-responsive: swipeable panel navigation
  if (isMobile) {
    return <MobileDashboard />;
  }

  return (
    <div className="h-full flex flex-col gap-1.5 overflow-hidden">
      {/* Scrolling Price Ticker - Very Top */}
      {isVisible('ticker') && <ScrollingPriceTicker />}
      
      {/* Top Control Bar - Merged Bot Status + Quick Actions */}
      {isVisible('control-bar') && <UnifiedControlBar />}
      
      {/* Compact Metrics Bar */}
      {isVisible('metrics') && <CompactMetricsBar />}
      
      {/* Main 3-Column Grid - No Scroll */}
      <div className="flex-1 grid grid-cols-[30%_40%_30%] gap-2 min-h-0">
        {/* LEFT Column - AI Market Analysis (Full Height) */}
        {isVisible('ai-analysis') && (
          <div className="min-h-0">
            <AIMarketUpdatesPanel fullHeight />
          </div>
        )}
        
        {/* CENTER Column - Live Trade Activity Terminal (Full Height) */}
        {isVisible('trade-terminal') && (
          <div className="min-h-0">
            <TradeActivityTerminal expanded />
          </div>
        )}
        
        {/* RIGHT Column - News (longest) + Smaller panels */}
        <div className="flex flex-col gap-1 min-h-0 h-full">
          {/* News Panel - PRIMARY: Takes most space */}
          {isVisible('news') && (
            <div className="flex-1 min-h-[200px]">
              <NewsPanel />
            </div>
          )}
          
          {/* Underwater Positions Panel - Compact */}
          {isVisible('underwater') && (
            <div className="h-[90px] flex-shrink-0">
              <UnderwaterPositionsPanel />
            </div>
          )}
          
          {/* AI Provider Health Dashboard - Compact */}
          {isVisible('ai-health') && (
            <div className="h-[80px] flex-shrink-0">
              <AIProviderHealthDashboard />
            </div>
          )}
          
          {/* Infrastructure Panel - Compact */}
          {isVisible('infrastructure') && (
            <div className="h-[80px] flex-shrink-0">
              <InfrastructurePanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
