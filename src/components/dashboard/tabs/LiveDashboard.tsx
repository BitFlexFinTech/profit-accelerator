import { useEffect, useState } from 'react';
import { SentimentPanel } from '../panels/SentimentPanel';
import { TradeCopierPanel } from '../panels/TradeCopierPanel';
import { ExchangePingPanel } from '../panels/ExchangePingPanel';
import { PnLPanel } from '../panels/PnLPanel';
import { RecentTradesPanel } from '../panels/RecentTradesPanel';
import { QuickActionsPanel } from '../panels/QuickActionsPanel';
import { MarketWatchPanel } from '../panels/MarketWatchPanel';
import { CloudStatusPanel } from '../panels/CloudStatusPanel';
import { VPSTerminalPanel } from '../panels/VPSTerminalPanel';
import { VPSMonitorPanel } from '../panels/VPSMonitorPanel';
import { TradeLogPanel } from '../panels/TradeLogPanel';
import { FailoverStatusPanel } from '../panels/FailoverStatusPanel';
import { FailoverHistoryPanel } from '../panels/FailoverHistoryPanel';
import { BotControlPanel } from '../BotControlPanel';
import { EquityChartPanel } from '../panels/EquityChartPanel';
import { APIDiagnosticsPanel } from '../panels/APIDiagnosticsPanel';
import { VPSMeshPanel } from '../panels/VPSMeshPanel';
import { MeshHealthScoreWidget } from '../panels/MeshHealthScoreWidget';
import { VPSLatencyTrendsPanel } from '../panels/VPSLatencyTrendsPanel';
import { VPSDeploymentTimelinePanel } from '../panels/VPSDeploymentTimelinePanel';
import { CloudCostComparisonPanel } from '../panels/CloudCostComparisonPanel';
import { CostOptimizationPanel } from '../panels/CostOptimizationPanel';
import { VPSBenchmarkPanel } from '../panels/VPSBenchmarkPanel';
import { useTradeNotifications } from '@/hooks/useTradeNotifications';
import { useExchangeWebSocket } from '@/hooks/useExchangeWebSocket';
import { supabase } from '@/integrations/supabase/client';

export function LiveDashboard() {
  // Subscribe to real-time trade notifications
  useTradeNotifications();
  
  // Get sync function from WebSocket hook
  const { sync } = useExchangeWebSocket();

  // Fetch VPS config for dynamic IP
  const [vpsConfig, setVpsConfig] = useState<{ outbound_ip: string; provider: string } | null>(null);
  
  useEffect(() => {
    sync();
    
    const fetchVps = async () => {
      const { data } = await supabase
        .from('vps_config')
        .select('outbound_ip, provider')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      if (data) setVpsConfig(data);
    };
    fetchVps();
  }, [sync]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Bot Control Panel - Master START/STOP */}
      <BotControlPanel />

      {/* Cloud Status Panel */}
      <CloudStatusPanel />

      {/* VPS Mesh Panel - 8 Provider Grid */}
      <VPSMeshPanel />

      {/* Mesh Health Score Widget */}
      <MeshHealthScoreWidget />

      {/* VPS Latency Trends - 24h Chart */}
      <VPSLatencyTrendsPanel />

      {/* VPS Deployment Timeline */}
      <VPSDeploymentTimelinePanel />

      {/* Cloud Cost Comparison Table */}
      <CloudCostComparisonPanel />

      {/* VPS Monitor Panel - Real-time metrics */}
      <VPSMonitorPanel />

      {/* Equity Chart - Full Width */}
      <EquityChartPanel />

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
          <FailoverHistoryPanel />
        </div>

        {/* Center Column */}
        <div className="lg:col-span-1 space-y-6">
          <SentimentPanel />
          <TradeLogPanel />
          <CostOptimizationPanel />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <ExchangePingPanel />
          <APIDiagnosticsPanel />
          <TradeCopierPanel />
          <VPSBenchmarkPanel />
        </div>
      </div>

      {/* Full Width Terminal */}
      {vpsConfig?.outbound_ip && (
        <VPSTerminalPanel 
          serverIp={vpsConfig.outbound_ip} 
          serverName={`${vpsConfig.provider === 'contabo' ? 'Contabo Singapore' : vpsConfig.provider}`} 
        />
      )}
    </div>
  );
}
