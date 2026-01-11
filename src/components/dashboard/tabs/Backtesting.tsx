import { useState, useEffect } from 'react';
import { Play, Calendar, TrendingUp, Loader2, DollarSign, Percent, Clock, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CHART_COLORS, chartStyles } from '@/lib/chartTheme';

interface BacktestResult {
  id: string;
  strategy_name: string;
  symbol: string;
  start_date: string;
  end_date: string;
  total_pnl: number | null;
  total_trades: number | null;
  win_rate: number | null;
  max_drawdown: number | null;
  sharpe_ratio: number | null;
  created_at: string | null;
  fees_paid?: number | null;
  slippage_cost?: number | null;
  timeframe?: string | null;
  take_profit_pct?: number | null;
  stop_loss_pct?: number | null;
  initial_balance?: number | null;
  final_balance?: number | null;
  equity_curve?: { time: number; balance: number }[] | null;
}

interface Trade {
  entry: number;
  exit: number;
  pnl: number;
  side: 'long' | 'short';
  entryTime?: number;
  exitTime?: number;
}

const SYMBOLS = [
  { value: 'BTCUSDT', label: 'BTC/USDT' },
  { value: 'ETHUSDT', label: 'ETH/USDT' },
  { value: 'BNBUSDT', label: 'BNB/USDT' },
  { value: 'SOLUSDT', label: 'SOL/USDT' },
  { value: 'XRPUSDT', label: 'XRP/USDT' },
  { value: 'ADAUSDT', label: 'ADA/USDT' },
];

const TIMEFRAMES = [
  { value: '1h', label: '1 Hour' },
  { value: '4h', label: '4 Hours' },
  { value: '1d', label: '1 Day' },
];

// Strategies are loaded from database - no hardcoded values

export function Backtesting() {
  const [results, setResults] = useState<BacktestResult | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [equityCurve, setEquityCurve] = useState<{ time: number; balance: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [strategies, setStrategies] = useState<{ value: string; label: string }[]>([]);

  // Configuration state
  const [strategy, setStrategy] = useState('');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [initialBalance, setInitialBalance] = useState(10000);
  const [takeProfitPct, setTakeProfitPct] = useState([2.0]);
  const [stopLossPct, setStopLossPct] = useState([1.0]);
  const [feesPct, setFeesPct] = useState(0.1);
  const [slippagePct, setSlippagePct] = useState(0.05);

  // Fetch strategies and latest backtest results from database
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch strategies from database
        const { data: strategyData } = await supabase
          .from('strategy_config')
          .select('strategy_name, display_name')
          .eq('is_enabled', true);
        
        if (strategyData && strategyData.length > 0) {
          setStrategies(strategyData.map(s => ({ 
            value: s.strategy_name, 
            label: s.display_name 
          })));
          setStrategy(strategyData[0].strategy_name);
        }

        // Fetch latest backtest results
        const { data, error } = await supabase
          .from('backtest_results')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw error;
        if (data && data.length > 0) {
          const result = data[0] as BacktestResult;
          setResults(result);
          if (result.equity_curve && Array.isArray(result.equity_curve)) {
            setEquityCurve(result.equity_curve);
          }
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const runBacktest = async () => {
    setIsRunning(true);
    try {
      // First, insert a pending backtest record
      const { data: insertedRecord, error: insertError } = await supabase
        .from('backtest_results')
        .insert({
          strategy_name: strategy,
          symbol,
          start_date: startDate,
          end_date: endDate,
          timeframe,
          take_profit_pct: takeProfitPct[0],
          stop_loss_pct: stopLossPct[0],
          initial_balance: initialBalance,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      
      toast.info('Backtest started - fetching historical data...');
      
      // Call the backtest edge function
      const { data: backtestResult, error: fnError } = await supabase.functions.invoke('run-backtest', {
        body: {
          backtestId: insertedRecord.id,
          strategy,
          symbol: symbol.replace('USDT', '/USDT'),
          startDate,
          endDate,
          initialBalance,
          takeProfitPct: takeProfitPct[0],
          stopLossPct: stopLossPct[0],
          feesPct,
          slippagePct,
          timeframe,
        }
      });
      
      if (fnError) throw fnError;
      
      if (!backtestResult?.success) {
        throw new Error(backtestResult?.error || 'Backtest failed');
      }
      
      // Update UI with results
      if (backtestResult.trades) {
        setTrades(backtestResult.trades);
      }
      if (backtestResult.equityCurve) {
        setEquityCurve(backtestResult.equityCurve);
      }
      
      // Refetch the updated result
      const { data: updatedResult } = await supabase
        .from('backtest_results')
        .select('*')
        .eq('id', insertedRecord.id)
        .single();
      
      if (updatedResult) {
        setResults(updatedResult as BacktestResult);
      }
      
      toast.success(`Backtest complete! ${backtestResult.results.totalTrades} trades simulated`);
    } catch (err: unknown) {
      console.error('Failed to run backtest:', err);
      const message = err instanceof Error ? err.message : 'Failed to run backtest';
      toast.error(message);
    } finally {
      setIsRunning(false);
    }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Format equity curve data for chart
  const chartData = equityCurve.map((point) => ({
    time: point.time,
    date: format(new Date(point.time), 'MMM dd'),
    balance: Math.round(point.balance * 100) / 100,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Advanced Backtesting</h2>
      </div>

      {/* Configuration Panel */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Backtest Configuration
        </h3>
        
        {/* Row 1: Basic Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="space-y-2">
            <Label>Strategy</Label>
            <Select value={strategy} onValueChange={setStrategy} disabled={strategies.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={strategies.length === 0 ? "No strategies configured" : "Select strategy"} />
              </SelectTrigger>
              <SelectContent>
                {strategies.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Symbol</Label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYMBOLS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Timeframe</Label>
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEFRAMES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Initial Balance</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                type="number" 
                className="pl-9 bg-secondary/50" 
                value={initialBalance}
                onChange={(e) => setInitialBalance(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Row 2: Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="space-y-2">
            <Label>Start Date</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                type="date" 
                className="pl-10 bg-secondary/50" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>End Date</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                type="date" 
                className="pl-10 bg-secondary/50" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Row 3: Advanced Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-success" />
                Take Profit
              </Label>
              <span className="text-sm font-medium text-success">{takeProfitPct[0]}%</span>
            </div>
            <Slider
              value={takeProfitPct}
              onValueChange={setTakeProfitPct}
              min={0.5}
              max={10}
              step={0.5}
              className="w-full"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-destructive rotate-180" />
                Stop Loss
              </Label>
              <span className="text-sm font-medium text-destructive">{stopLossPct[0]}%</span>
            </div>
            <Slider
              value={stopLossPct}
              onValueChange={setStopLossPct}
              min={0.5}
              max={5}
              step={0.25}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Percent className="w-3 h-3" />
              Trading Fees
            </Label>
            <Input 
              type="number" 
              className="bg-secondary/50" 
              value={feesPct}
              onChange={(e) => setFeesPct(Number(e.target.value))}
              step={0.01}
              min={0}
              max={1}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Slippage
            </Label>
            <Input 
              type="number" 
              className="bg-secondary/50" 
              value={slippagePct}
              onChange={(e) => setSlippagePct(Number(e.target.value))}
              step={0.01}
              min={0}
              max={1}
            />
          </div>
        </div>

        <Button className="gap-2" onClick={runBacktest} disabled={isRunning}>
          {isRunning ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {isRunning ? 'Running Backtest...' : 'Run Backtest'}
        </Button>
      </div>

      {/* Results */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4">Results</h3>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !results ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No backtest results yet.</p>
            <p className="text-sm mt-2">Configure parameters above and click "Run Backtest"</p>
          </div>
        ) : results.total_pnl !== null ? (
          <>
            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-sm text-muted-foreground">Total P&L</p>
                <p className={`text-xl font-bold ${(results.total_pnl ?? 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(results.total_pnl)}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-sm text-muted-foreground">Final Balance</p>
                <p className="text-xl font-bold">
                  {formatCurrency(results.final_balance)}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-sm text-muted-foreground">Max Drawdown</p>
                <p className="text-xl font-bold text-destructive">
                  {results.max_drawdown !== null ? `${results.max_drawdown.toFixed(1)}%` : '—'}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-sm text-muted-foreground">Win Rate</p>
                <p className="text-xl font-bold">
                  {results.win_rate !== null ? `${results.win_rate.toFixed(1)}%` : '—'}
                </p>
              </div>
            </div>

            {/* Secondary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-3 rounded-lg bg-secondary/20">
                <p className="text-xs text-muted-foreground">Total Trades</p>
                <p className="text-lg font-semibold">{results.total_trades ?? '—'}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/20">
                <p className="text-xs text-muted-foreground">Sharpe Ratio</p>
                <p className="text-lg font-semibold">{results.sharpe_ratio?.toFixed(2) ?? '—'}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/20">
                <p className="text-xs text-muted-foreground">Fees Paid</p>
                <p className="text-lg font-semibold text-amber-400">{formatCurrency(results.fees_paid)}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/20">
                <p className="text-xs text-muted-foreground">Slippage Cost</p>
                <p className="text-lg font-semibold text-amber-400">{formatCurrency(results.slippage_cost)}</p>
              </div>
            </div>

            {/* Equity Curve Chart */}
            {chartData.length > 0 ? (
              <div className="h-64 rounded-lg bg-secondary/10 p-4">
                <p className="text-sm text-muted-foreground mb-2">Equity Curve</p>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid {...chartStyles.grid} />
                    <XAxis 
                      dataKey="date" 
                      {...chartStyles.xAxis}
                      tick={{ ...chartStyles.tick, fontSize: 10 }}
                    />
                    <YAxis 
                      {...chartStyles.yAxis}
                      tick={{ ...chartStyles.tick, fontSize: 10 }}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip 
                      contentStyle={chartStyles.tooltip.contentStyle}
                      formatter={(value: number) => [`$${value.toLocaleString()}`, 'Balance']}
                    />
                    <ReferenceLine 
                      y={initialBalance} 
                      stroke={CHART_COLORS.grid} 
                      strokeDasharray="3 3" 
                    />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      stroke={CHART_COLORS.primary}
                      strokeWidth={chartStyles.area.strokeWidth}
                      fill={CHART_COLORS.primary}
                      fillOpacity={0.15}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 rounded-lg bg-secondary/20 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Run a backtest to see the equity curve</p>
                </div>
              </div>
            )}

            {/* Recent Trades */}
            {trades.length > 0 && (
              <div className="mt-6">
                <p className="text-sm text-muted-foreground mb-3">Recent Trades (Last 20)</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Side</th>
                        <th className="text-right py-2 px-3 text-muted-foreground font-medium">Entry</th>
                        <th className="text-right py-2 px-3 text-muted-foreground font-medium">Exit</th>
                        <th className="text-right py-2 px-3 text-muted-foreground font-medium">P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.slice(-10).map((trade, idx) => (
                        <tr key={idx} className="border-b border-border/50">
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              trade.side === 'long' 
                                ? 'bg-success/20 text-success' 
                                : 'bg-destructive/20 text-destructive'
                            }`}>
                              {trade.side.toUpperCase()}
                            </span>
                          </td>
                          <td className="text-right py-2 px-3 font-mono">${trade.entry.toFixed(2)}</td>
                          <td className="text-right py-2 px-3 font-mono">${trade.exit.toFixed(2)}</td>
                          <td className={`text-right py-2 px-3 font-mono font-medium ${
                            trade.pnl >= 0 ? 'text-success' : 'text-destructive'
                          }`}>
                            {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <TrendingUp className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground mb-2">No backtest results yet</p>
            <p className="text-sm text-muted-foreground/70">
              Configure and run a backtest to see results
            </p>
          </div>
        )}
      </div>
    </div>
  );
}