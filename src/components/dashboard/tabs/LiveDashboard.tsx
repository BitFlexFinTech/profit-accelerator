import { useEffect } from 'react';
import { UnifiedControlBar } from '../panels/UnifiedControlBar';
import { CompactMetricsBar } from '../panels/CompactMetricsBar';
import { TradeActivityTerminal } from '../panels/TradeActivityTerminal';
import { AIMarketUpdatesPanel } from '../panels/AIMarketUpdatesPanel';
import { ScrollingPriceTicker } from '../panels/ScrollingPriceTicker';
import { NewsPanel } from '../panels/NewsPanel';
import { InfrastructurePanel } from '../panels/InfrastructurePanel';
import { AIProviderHealthDashboard } from '../panels/AIProviderHealthDashboard';
import { useTradeNotifications } from '@/hooks/useTradeNotifications';
import { useExchangeWebSocket } from '@/hooks/useExchangeWebSocket';
import { useLiveBalancePolling } from '@/hooks/useLiveBalancePolling';
import { useRateLimitRecovery } from '@/hooks/useRateLimitRecovery';
import { ModeProgressTracker } from '../panels/ModeProgressTracker';
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
      
      {/* Mode Progress Tracker - Temporary cards until live mode unlocked */}
      {isVisible('mode-progress') && <ModeProgressTracker />}
      
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
        
        {/* RIGHT Column - News + Infrastructure + AI Health */}
        <div className="flex flex-col gap-1 min-h-0 h-full">
          {/* News Panel - EXPANDED (takes most space) */}
          {isVisible('news') && (
            <div className="flex-1 min-h-0">
              <NewsPanel />
            </div>
          )}
          
          {/* AI Provider Health Dashboard */}
          {isVisible('ai-health') && (
            <div className="h-[200px] flex-shrink-0">
              <AIProviderHealthDashboard />
            </div>
          )}
          
          {/* Infrastructure Panel - Shows latency */}
          {isVisible('infrastructure') && (
            <div className="h-[140px] flex-shrink-0">
              <InfrastructurePanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}