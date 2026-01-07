import { useState, useEffect } from 'react';
import { Play, Calendar, TrendingUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';

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
}

export function Backtesting() {
  const [results, setResults] = useState<BacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [strategy, setStrategy] = useState('Momentum Scalper');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [initialBalance, setInitialBalance] = useState(10000);

  // Fetch latest backtest results from database
  useEffect(() => {
    const fetchResults = async () => {
      try {
        const { data, error } = await supabase
          .from('backtest_results')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw error;
        if (data && data.length > 0) {
          setResults(data[0]);
        }
      } catch (err) {
        console.error('Failed to fetch backtest results:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, []);

  const runBacktest = async () => {
    setIsRunning(true);
    try {
      // Insert a new backtest request - in production this would trigger actual backtesting
      const { data, error } = await supabase
        .from('backtest_results')
        .insert({
          strategy_name: strategy,
          symbol: 'BTCUSDT',
          start_date: startDate,
          end_date: endDate,
          total_pnl: null,
          total_trades: null,
          win_rate: null,
          max_drawdown: null,
          sharpe_ratio: null,
        })
        .select()
        .single();

      if (error) throw error;
      
      toast.success('Backtest started - results will appear when complete');
      if (data) setResults(data);
    } catch (err) {
      console.error('Failed to start backtest:', err);
      toast.error('Failed to start backtest');
    } finally {
      setIsRunning(false);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return '—';
    return `$${value.toLocaleString()}`;
  };

  const formatPercent = (value: number | null) => {
    if (value === null) return '—';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Backtesting Simulator</h2>
      </div>

      {/* Configuration Panel */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4">Backtest Configuration</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Strategy</label>
            <select 
              className="w-full h-10 rounded-lg bg-secondary/50 border border-border px-3"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
            >
              <option>Momentum Scalper</option>
              <option>Mean Reversion</option>
            </select>
          </div>
          
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Start Date</label>
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
          
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">End Date</label>
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
          
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Initial Balance</label>
            <Input 
              type="number" 
              className="bg-secondary/50" 
              value={initialBalance}
              onChange={(e) => setInitialBalance(Number(e.target.value))}
            />
          </div>
        </div>

        <Button className="gap-2" onClick={runBacktest} disabled={isRunning}>
          {isRunning ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {isRunning ? 'Running...' : 'Run Backtest'}
        </Button>
      </div>

      {/* Results */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4">Results</h3>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : results ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-sm text-muted-foreground">Total P&L</p>
                <p className={`text-xl font-bold ${(results.total_pnl ?? 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(results.total_pnl)}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-sm text-muted-foreground">Max Drawdown</p>
                <p className="text-xl font-bold text-destructive">
                  {results.max_drawdown !== null ? `${results.max_drawdown.toFixed(1)}%` : '—'}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-sm text-muted-foreground">Total Trades</p>
                <p className="text-xl font-bold">{results.total_trades ?? '—'}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-sm text-muted-foreground">Win Rate</p>
                <p className="text-xl font-bold">
                  {results.win_rate !== null ? `${results.win_rate.toFixed(1)}%` : '—'}
                </p>
              </div>
            </div>

            {/* Chart - show placeholder if no data */}
            <div className="h-64 rounded-lg bg-secondary/20 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Run a backtest to see the equity curve</p>
              </div>
            </div>
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
