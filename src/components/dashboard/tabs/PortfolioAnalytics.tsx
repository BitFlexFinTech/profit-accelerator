import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Activity, Target, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

// Import panels for Analytics tab
import { VPSMeshPanel } from '../panels/VPSMeshPanel';
import { MeshHealthScoreWidget } from '../panels/MeshHealthScoreWidget';
import { VPSLatencyTrendsPanel } from '../panels/VPSLatencyTrendsPanel';
import { VPSDeploymentTimelinePanel } from '../panels/VPSDeploymentTimelinePanel';
import { CloudCostComparisonPanel } from '../panels/CloudCostComparisonPanel';
import { VPSMonitorPanel } from '../panels/VPSMonitorPanel';
import { FailoverStatusPanel } from '../panels/FailoverStatusPanel';
import { FailoverHistoryPanel } from '../panels/FailoverHistoryPanel';
import { TradeLogPanel } from '../panels/TradeLogPanel';
import { CostOptimizationPanel } from '../panels/CostOptimizationPanel';
import { ExchangePingPanel } from '../panels/ExchangePingPanel';
import { APIDiagnosticsPanel } from '../panels/APIDiagnosticsPanel';
import { TradeCopierPanel } from '../panels/TradeCopierPanel';
import { VPSBenchmarkPanel } from '../panels/VPSBenchmarkPanel';
import { VPSTerminalPanel } from '../panels/VPSTerminalPanel';
import { RecentTradesPanel } from '../panels/RecentTradesPanel';
import { PnLPanel } from '../panels/PnLPanel';
import { TradeExecutionLatencyPanel } from '../panels/TradeExecutionLatencyPanel';

interface PortfolioMetrics {
  sharpeRatio: number | null;
  maxDrawdown: number | null;
  winRate: number | null;
  profitFactor: number | null;
}

interface BalancePoint {
  date: string;
  balance: number;
}

export function PortfolioAnalytics() {
  const [metrics, setMetrics] = useState<PortfolioMetrics>({
    sharpeRatio: null,
    maxDrawdown: null,
    winRate: null,
    profitFactor: null,
  });
  const [equityData, setEquityData] = useState<BalancePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [vpsConfig, setVpsConfig] = useState<{ outbound_ip: string; provider: string } | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        // Fetch balance history for equity curve
        const { data: balanceData, error: balanceError } = await supabase
          .from('balance_history')
          .select('total_balance, snapshot_time')
          .order('snapshot_time', { ascending: true })
          .limit(100);

        if (balanceError) throw balanceError;

        if (balanceData && balanceData.length > 0) {
          setEquityData(balanceData.map(b => ({
            date: format(new Date(b.snapshot_time || Date.now()), 'MMM dd'),
            balance: b.total_balance,
          })));

          // Calculate metrics from balance history
          const balances = balanceData.map(b => b.total_balance);
          const maxBalance = Math.max(...balances);
          const minBalance = Math.min(...balances);
          const maxDrawdown = maxBalance > 0 ? ((maxBalance - minBalance) / maxBalance) * 100 : null;

          setMetrics(prev => ({
            ...prev,
            maxDrawdown,
          }));
        }

        // Fetch trading journal for win rate calculation
        const { data: trades, error: tradesError } = await supabase
          .from('trading_journal')
          .select('pnl, status')
          .eq('status', 'closed');

        if (!tradesError && trades && trades.length > 0) {
          const winningTrades = trades.filter(t => (t.pnl ?? 0) > 0).length;
          const winRate = (winningTrades / trades.length) * 100;

          const totalProfit = trades.filter(t => (t.pnl ?? 0) > 0).reduce((sum, t) => sum + (t.pnl ?? 0), 0);
          const totalLoss = Math.abs(trades.filter(t => (t.pnl ?? 0) < 0).reduce((sum, t) => sum + (t.pnl ?? 0), 0));
          const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : null;

          setMetrics(prev => ({
            ...prev,
            winRate,
            profitFactor,
          }));
        }

        // Fetch backtest results for Sharpe ratio
        const { data: backtestData } = await supabase
          .from('backtest_results')
          .select('sharpe_ratio')
          .order('created_at', { ascending: false })
          .limit(1);

        if (backtestData && backtestData.length > 0 && backtestData[0].sharpe_ratio !== null) {
          setMetrics(prev => ({
            ...prev,
            sharpeRatio: backtestData[0].sharpe_ratio,
          }));
        }

        // Fetch VPS config for terminal
        const { data: vpsData } = await supabase
          .from('vps_config')
          .select('outbound_ip, provider')
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();
        
        if (vpsData) setVpsConfig(vpsData);

      } catch (err) {
        console.error('Failed to fetch portfolio analytics:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  const formatMetric = (value: number | null, suffix: string = '') => {
    if (value === null) return '—';
    return `${value.toFixed(2)}${suffix}`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Portfolio Analytics</h2>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sharpe Ratio</p>
              <p className={`text-xl font-bold ${metrics.sharpeRatio !== null && metrics.sharpeRatio > 1 ? 'text-success' : ''}`}>
                {formatMetric(metrics.sharpeRatio)}
              </p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Max Drawdown</p>
              <p className="text-xl font-bold text-destructive">
                {metrics.maxDrawdown !== null ? `-${metrics.maxDrawdown.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Win Rate</p>
              <p className="text-xl font-bold">
                {metrics.winRate !== null ? `${metrics.winRate.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Target className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Profit Factor</p>
              <p className="text-xl font-bold">
                {formatMetric(metrics.profitFactor)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* P&L Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <PnLPanel />
      </div>

      {/* Trade Execution Latency - Moved from LiveDashboard */}
      <TradeExecutionLatencyPanel />

      {/* Equity Curve Chart */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4">Equity Curve</h3>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : equityData.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityData}>
                <defs>
                  <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Balance']}
                />
                <Area 
                  type="monotone" 
                  dataKey="balance" 
                  stroke="hsl(var(--primary))" 
                  fill="url(#colorBalance)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No balance history data available</p>
            </div>
          </div>
        )}
      </div>

      {/* VPS Infrastructure Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <VPSMeshPanel />
        <MeshHealthScoreWidget />
      </div>
      
      <VPSLatencyTrendsPanel />
      <VPSDeploymentTimelinePanel />
      <CloudCostComparisonPanel />
      <VPSMonitorPanel />

      {/* Trading Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TradeLogPanel />
        <TradeCopierPanel />
        <CostOptimizationPanel />
      </div>

      <RecentTradesPanel />

      {/* Monitoring Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FailoverStatusPanel />
        <FailoverHistoryPanel />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExchangePingPanel />
        <APIDiagnosticsPanel />
      </div>

      <VPSBenchmarkPanel />

      {/* VPS Terminal */}
      {vpsConfig?.outbound_ip && (
        <VPSTerminalPanel 
          serverIp={vpsConfig.outbound_ip} 
          serverName={`${vpsConfig.provider === 'contabo' ? 'Contabo Singapore' : vpsConfig.provider}`} 
        />
      )}
    </div>
  );
}
