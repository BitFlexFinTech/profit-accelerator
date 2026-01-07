import { useEffect, useCallback } from 'react';
import { BotControlPanel } from '../BotControlPanel';
import { CompactMetricsBar } from '../panels/CompactMetricsBar';
import { EquityChartPanel } from '../panels/EquityChartPanel';
import { TradeActivityTerminal } from '../panels/TradeActivityTerminal';
import { CloudStatusPanel } from '../panels/CloudStatusPanel';
import { SentimentPanel } from '../panels/SentimentPanel';
import { AIMarketUpdatesPanel } from '../panels/AIMarketUpdatesPanel';
import { useTradeNotifications } from '@/hooks/useTradeNotifications';
import { useExchangeWebSocket } from '@/hooks/useExchangeWebSocket';
import { supabase } from '@/integrations/supabase/client';

export function LiveDashboard() {
  // Subscribe to real-time trade notifications
  useTradeNotifications();
  
  // Get sync function from WebSocket hook
  const { sync } = useExchangeWebSocket();

  // Auto-sync balances every 30 seconds
  const syncBalances = useCallback(async () => {
    console.log('[LiveDashboard] Auto-syncing balances...');
    try {
      await supabase.functions.invoke('trade-engine', {
        body: { action: 'sync-balances' }
      });
    } catch (err) {
      console.error('[LiveDashboard] Balance sync error:', err);
    }
  }, []);

  useEffect(() => {
    sync();
    syncBalances(); // Initial sync
    
    // Auto-sync every 30 seconds
    const interval = setInterval(syncBalances, 30000);
    return () => clearInterval(interval);
  }, [sync, syncBalances]);

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col gap-3 overflow-hidden animate-fade-in">
      {/* Bot Control Panel - Compact */}
      <div className="flex-shrink-0">
        <BotControlPanel />
      </div>

      {/* Key Metrics Row - 4 metrics + AI insight */}
      <div className="flex-shrink-0">
        <CompactMetricsBar />
      </div>

      {/* Main Content Area - Fixed, no scroll */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-3 min-h-0">
        {/* Left: Equity Chart + Trade Activity (60% width) */}
        <div className="lg:col-span-3 flex flex-col gap-3 min-h-0">
          <div className="flex-shrink-0">
            <EquityChartPanel />
          </div>
          <div className="flex-1 min-h-0">
            <TradeActivityTerminal />
          </div>
        </div>

        {/* Right: Cloud Status + Sentiment + AI Updates (40% width) */}
        <div className="lg:col-span-2 flex flex-col gap-3 min-h-0">
          {/* Cloud Status - Compact 8-provider row */}
          <div className="flex-shrink-0">
            <CloudStatusPanel />
          </div>

          {/* Sentiment Panel - Exchange data only */}
          <div className="flex-shrink-0">
            <SentimentPanel />
          </div>

          {/* AI Market Updates - Takes remaining space */}
          <div className="flex-1 min-h-0">
            <AIMarketUpdatesPanel />
          </div>
        </div>
      </div>
    </div>
  );
}