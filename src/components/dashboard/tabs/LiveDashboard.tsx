import { useEffect } from 'react';
import { SentimentPanel } from '../panels/SentimentPanel';
import { TradeCopierPanel } from '../panels/TradeCopierPanel';
import { ExchangePingPanel } from '../panels/ExchangePingPanel';
import { PnLPanel } from '../panels/PnLPanel';
import { RecentTradesPanel } from '../panels/RecentTradesPanel';
import { QuickActionsPanel } from '../panels/QuickActionsPanel';
import { MarketWatchPanel } from '../panels/MarketWatchPanel';
import { CloudStatusPanel } from '../panels/CloudStatusPanel';
import { VPSTerminalPanel } from '../panels/VPSTerminalPanel';
import { TradeLogPanel } from '../panels/TradeLogPanel';
import { FailoverStatusPanel } from '../panels/FailoverStatusPanel';
import { BotControlPanel } from '../BotControlPanel';
import { useTradeNotifications } from '@/hooks/useTradeNotifications';
import { useExchangeWebSocket } from '@/hooks/useExchangeWebSocket';

export function LiveDashboard() {
  // Subscribe to real-time trade notifications
  useTradeNotifications();
  
  // Get sync function from WebSocket hook
  const { sync } = useExchangeWebSocket();
  
  // Force immediate balance sync on mount
  useEffect(() => {
    sync();
  }, [sync]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Bot Control Panel - Master START/STOP */}
      <BotControlPanel />

      {/* Cloud Status Panel - Shows your Vultr server at 167.179.83.239 */}
      <CloudStatusPanel />

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
          <FailoverStatusPanel />
        </div>

        {/* Center Column */}
        <div className="lg:col-span-1 space-y-6">
          <SentimentPanel />
          <TradeLogPanel />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <ExchangePingPanel />
          <TradeCopierPanel />
        </div>
      </div>

      {/* Full Width Terminal */}
      <VPSTerminalPanel 
        serverIp="167.179.83.239" 
        serverName="Vultr Tokyo" 
      />
    </div>
  );
}
