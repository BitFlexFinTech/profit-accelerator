import { useState, useEffect } from 'react';
import { Plus, Play, Pause, Trash2, Loader2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { StrategyWizard } from '../wizards/StrategyWizard';

interface Strategy {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_paused: boolean;
  win_rate: number;
  trades_today: number;
  pnl_today: number;
  trading_mode: string;
  leverage: number;
}

interface TradingConfig {
  trading_mode: string;
  leverage: number;
}

export function StrategyBuilder() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [tradingMode, setTradingMode] = useState<'spot' | 'futures'>('spot');
  const [leverage, setLeverage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isSavingMode, setIsSavingMode] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch strategies
        const { data: strategiesData } = await supabase
          .from('trading_strategies')
          .select('*')
          .order('created_at', { ascending: true });

        if (strategiesData) {
          setStrategies(strategiesData as Strategy[]);
        }

        // Fetch trading config
        const { data: configData } = await supabase
          .from('trading_config')
          .select('trading_mode, leverage')
          .single();

        if (configData) {
          const config = configData as TradingConfig;
          setTradingMode((config.trading_mode as 'spot' | 'futures') || 'spot');
          setLeverage(config.leverage || 1);
        }
      } catch (err) {
        console.error('[StrategyBuilder] Error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('strategy-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trading_strategies'
      }, () => fetchData())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trading_config'
      }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleModeChange = async (mode: 'spot' | 'futures') => {
    setIsSavingMode(true);
    try {
      await supabase.from('trading_config')
        .update({ 
          trading_mode: mode,
          updated_at: new Date().toISOString()
        })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      setTradingMode(mode);
      toast.success(`Switched to ${mode.toUpperCase()} mode`);
    } catch (error) {
      toast.error('Failed to update trading mode');
    } finally {
      setIsSavingMode(false);
    }
  };

  const handleLeverageChange = async (value: number[]) => {
    const newLeverage = value[0];
    setLeverage(newLeverage);
    
    try {
      await supabase.from('trading_config')
        .update({ 
          leverage: newLeverage,
          updated_at: new Date().toISOString()
        })
        .neq('id', '00000000-0000-0000-0000-000000000000');
    } catch (error) {
      console.error('[StrategyBuilder] Leverage update error:', error);
    }
  };

  const getServerIp = async (): Promise<string> => {
    const { data: vps } = await supabase
      .from('hft_deployments')
      .select('ip_address')
      .not('ip_address', 'is', null)
      .limit(1)
      .single();
    return vps?.ip_address || '';
  };

  const handlePauseStrategy = async (strategyId: string) => {
    setLoadingId(strategyId);
    try {
      // Update database
      await supabase.from('trading_strategies')
        .update({ 
          is_paused: true, 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', strategyId);

      const serverIp = await getServerIp();
      if (serverIp) {
        // Signal VPS to pause this strategy
        await supabase.functions.invoke('install-hft-bot', {
          body: { 
            action: 'pause-strategy',
            strategyId,
            serverIp
          }
        });
      }

      toast.success('Strategy paused');
    } catch (error) {
      toast.error('Failed to pause strategy');
    } finally {
      setLoadingId(null);
    }
  };

  const handleStartStrategy = async (strategyId: string) => {
    setLoadingId(strategyId);
    try {
      // Update database
      await supabase.from('trading_strategies')
        .update({ 
          is_paused: false, 
          is_active: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', strategyId);

      const serverIp = await getServerIp();
      if (serverIp) {
        // Signal VPS to start this strategy
        await supabase.functions.invoke('install-hft-bot', {
          body: { 
            action: 'start-strategy',
            strategyId,
            serverIp
          }
        });
      }

      toast.success('Strategy started - LIVE TRADING');
    } catch (error) {
      toast.error('Failed to start strategy');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDeleteStrategy = async (strategyId: string) => {
    setLoadingId(strategyId);
    try {
      await supabase.from('trading_strategies')
        .delete()
        .eq('id', strategyId);

      toast.success('Strategy deleted');
    } catch (error) {
      toast.error('Failed to delete strategy');
    } finally {
      setLoadingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-bold">Strategy Builder</h2>
        <Button className="gap-2" onClick={() => setShowWizard(true)}>
          <Plus className="w-4 h-4" />
          New Strategy
        </Button>
      </div>

      {/* Strategy Wizard Dialog */}
      <StrategyWizard 
        open={showWizard} 
        onOpenChange={setShowWizard}
        onCreated={() => {
          // Refetch strategies - the realtime subscription will handle it
        }}
      />

      {/* Trading Mode & Leverage Controls */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap items-center gap-6">
          {/* Trading Mode Toggle */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Trading Mode:</span>
            <div className="flex gap-2">
              <Button 
                size="sm"
                variant={tradingMode === 'spot' ? 'default' : 'outline'}
                onClick={() => handleModeChange('spot')}
                disabled={isSavingMode}
              >
                Spot
              </Button>
              <Button 
                size="sm"
                variant={tradingMode === 'futures' ? 'default' : 'outline'}
                onClick={() => handleModeChange('futures')}
                disabled={isSavingMode}
                className={tradingMode === 'futures' ? 'bg-warning hover:bg-warning/90 text-warning-foreground' : ''}
              >
                Futures
              </Button>
            </div>
          </div>

          {/* Leverage Slider (only visible for Futures) */}
          {tradingMode === 'futures' && (
            <div className="flex items-center gap-3 flex-1 min-w-[200px]">
              <span className="text-sm font-medium text-muted-foreground">Leverage:</span>
              <Slider
                value={[leverage]}
                onValueChange={handleLeverageChange}
                min={1}
                max={20}
                step={1}
                className="w-32"
              />
              <Badge variant="outline" className="font-mono">
                {leverage}x
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* Strategy Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {strategies.map((strategy) => (
          <div key={strategy.id} className="glass-card-hover p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold">{strategy.name}</h3>
                <p className="text-sm text-muted-foreground">{strategy.description}</p>
              </div>
              <div className="flex items-center gap-1">
                {strategy.is_active && !strategy.is_paused ? (
                  <>
                    <div className="status-online" />
                    <span className="text-xs text-success">Active</span>
                  </>
                ) : (
                  <>
                    <div className="status-warning" />
                    <span className="text-xs text-warning">Paused</span>
                  </>
                )}
              </div>
            </div>
            
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Win Rate</span>
                <span className="font-medium">{strategy.win_rate}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Trades Today</span>
                <span className="font-medium">{strategy.trades_today}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">P&L Today</span>
                <span className={`font-medium ${strategy.pnl_today >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {strategy.pnl_today >= 0 ? '+' : ''}${strategy.pnl_today.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              {strategy.is_active && !strategy.is_paused ? (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 gap-1"
                  onClick={() => handlePauseStrategy(strategy.id)}
                  disabled={loadingId === strategy.id}
                >
                  {loadingId === strategy.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Pause className="w-3 h-3" />
                  )}
                  Pause
                </Button>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 gap-1 text-success hover:text-success"
                  onClick={() => handleStartStrategy(strategy.id)}
                  disabled={loadingId === strategy.id}
                >
                  {loadingId === strategy.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                  Start
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                className="text-destructive hover:text-destructive"
                onClick={() => handleDeleteStrategy(strategy.id)}
                disabled={loadingId === strategy.id}
              >
                {loadingId === strategy.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
              </Button>
            </div>
          </div>
        ))}

        {/* Add New Strategy Card */}
        <div className="glass-card border-dashed p-6 flex flex-col items-center justify-center text-center min-h-[200px] hover:border-primary/50 transition-colors cursor-pointer">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-3">
            <Plus className="w-6 h-6 text-primary" />
          </div>
          <p className="font-medium">Create New Strategy</p>
          <p className="text-sm text-muted-foreground">Visual no-code builder</p>
        </div>
      </div>
    </div>
  );
}
