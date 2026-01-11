import { useState, useEffect, useCallback } from 'react';
import { Plus, Play, Pause, Trash2, Loader2, TrendingUp, FileText, Info, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { StrategyWizard } from '../wizards/StrategyWizard';
import { ActionButton } from '@/components/ui/ActionButton';
import { BUTTON_TOOLTIPS } from '@/config/buttonTooltips';
import { cn } from '@/lib/utils';
import { StatusDot } from '@/components/ui/StatusDot';

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
  position_size: number;
  profit_target: number;
  profit_target_leverage?: number;
  daily_goal: number;
  daily_progress: number;
  source_framework: string | null;
  allowed_exchanges?: string[];
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
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [isSavingMode, setIsSavingMode] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // Fetch strategies from trading_strategies table
      const { data: strategiesData } = await supabase
        .from('trading_strategies')
        .select('*')
        .order('created_at', { ascending: true });

      // Also fetch from strategy_config (contains Piranha and other default strategies)
      const { data: configStrategies } = await supabase
        .from('strategy_config')
        .select('*')
        .order('created_at', { ascending: true });

      // Fetch connected exchanges to filter allowed_exchanges
      const { data: connectedExchanges } = await supabase
        .from('exchange_connections')
        .select('exchange_name')
        .eq('is_connected', true);

      const connectedSet = new Set(
        connectedExchanges?.map(e => e.exchange_name.toLowerCase()) || []
      );

      // Combine both sources, mapping strategy_config format to Strategy format
      const combinedStrategies: Strategy[] = [];
      
      if (strategiesData) {
        combinedStrategies.push(...strategiesData.map(s => ({
          ...s,
          position_size: s.position_size || 100,
          profit_target: s.profit_target || 10,
          daily_goal: s.daily_goal || 50,
          daily_progress: s.daily_progress || 0,
          win_rate: s.win_rate || 0,
          trades_today: s.trades_today || 0,
          pnl_today: s.pnl_today || 0,
          leverage: s.leverage || 1,
          source_framework: s.source_framework || null,
          allowed_exchanges: [],
        })) as Strategy[]);
      }

      // Add strategies from strategy_config if not already present
      if (configStrategies) {
        for (const cs of configStrategies) {
          const exists = combinedStrategies.some(s => 
            s.name?.toLowerCase() === cs.display_name?.toLowerCase() ||
            s.name?.toLowerCase() === cs.strategy_name?.toLowerCase()
          );
          if (!exists) {
            // Filter allowed_exchanges to only connected ones
            const filteredExchanges = (cs.allowed_exchanges || []).filter((ex: string) => 
              connectedSet.has(ex.toLowerCase())
            );
            
            combinedStrategies.push({
              id: cs.id,
              name: cs.display_name || cs.strategy_name,
              description: `${cs.strategy_name} strategy`,
              is_active: cs.is_enabled ?? false,
              is_paused: false,
              trading_mode: cs.use_leverage ? 'futures' : 'spot',
              position_size: cs.min_position_size || 100,
              profit_target: cs.profit_target_spot || 1,
              profit_target_leverage: cs.profit_target_leverage || 3,
              daily_goal: 50,
              daily_progress: 0,
              win_rate: 0,
              trades_today: 0,
              pnl_today: 0,
              leverage: cs.leverage_multiplier || 1,
              source_framework: null,
              allowed_exchanges: filteredExchanges,
            });
          }
        }
      }

      setStrategies(combinedStrategies);

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
  }, []);

  useEffect(() => {
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
  }, [fetchData]);

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

  const handleGlobalLeverageChange = async (value: number[]) => {
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

  // Strategy-specific handlers with debouncing
  const handlePositionSizeChange = async (strategyId: string, value: string) => {
    const size = parseFloat(value) || 100;
    
    // Update local state immediately for responsiveness
    setStrategies(prev => prev.map(s => 
      s.id === strategyId ? { ...s, position_size: size } : s
    ));

    // Debounce database update
    try {
      await supabase.from('trading_strategies')
        .update({ 
          position_size: size,
          updated_at: new Date().toISOString()
        })
        .eq('id', strategyId);
    } catch (error) {
      console.error('[StrategyBuilder] Position size update error:', error);
    }
  };

  const handleProfitTargetChange = async (strategyId: string, value: string) => {
    const target = parseFloat(value) || 10;
    
    setStrategies(prev => prev.map(s => 
      s.id === strategyId ? { ...s, profit_target: target } : s
    ));

    try {
      await supabase.from('trading_strategies')
        .update({ 
          profit_target: target,
          updated_at: new Date().toISOString()
        })
        .eq('id', strategyId);
    } catch (error) {
      console.error('[StrategyBuilder] Profit target update error:', error);
    }
  };

  const handleDailyGoalChange = async (strategyId: string, value: string) => {
    const goal = parseFloat(value) || 50;
    
    setStrategies(prev => prev.map(s => 
      s.id === strategyId ? { ...s, daily_goal: goal } : s
    ));

    try {
      await supabase.from('trading_strategies')
        .update({ 
          daily_goal: goal,
          updated_at: new Date().toISOString()
        })
        .eq('id', strategyId);
    } catch (error) {
      console.error('[StrategyBuilder] Daily goal update error:', error);
    }
  };

  const handleStrategyLeverageChange = async (strategyId: string, value: number) => {
    setStrategies(prev => prev.map(s => 
      s.id === strategyId ? { ...s, leverage: value } : s
    ));

    try {
      await supabase.from('trading_strategies')
        .update({ 
          leverage: value,
          updated_at: new Date().toISOString()
        })
        .eq('id', strategyId);
    } catch (error) {
      console.error('[StrategyBuilder] Strategy leverage update error:', error);
    }
  };

  // Activate strategy for live trading
  const handleActivateStrategy = async (strategyId: string) => {
    setActivatingId(strategyId);
    
    try {
      // Update strategy to active
      await supabase.from('trading_strategies')
        .update({ 
          is_active: true, 
          is_paused: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', strategyId);
      
      toast.success('Strategy activated for live trading');
      fetchData();
    } catch (error: any) {
      console.error('[StrategyBuilder] Activate error:', error);
      toast.error(`Activation failed: ${error.message}`);
    } finally {
      setActivatingId(null);
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
      await supabase.from('trading_strategies')
        .update({ 
          is_paused: true, 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', strategyId);

      const serverIp = await getServerIp();
      if (serverIp) {
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
      await supabase.from('trading_strategies')
        .update({ 
          is_paused: false, 
          is_active: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', strategyId);

      const serverIp = await getServerIp();
      if (serverIp) {
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
            <Skeleton key={i} className="h-80 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h2 className="text-2xl font-bold">Strategy Builder</h2>
          <ActionButton 
            className="gap-2" 
            onClick={() => setShowWizard(true)}
            tooltip={BUTTON_TOOLTIPS.newStrategy}
          >
            <Plus className="w-4 h-4" />
            New Strategy
          </ActionButton>
        </div>

        {/* Strategy Wizard Dialog */}
        <StrategyWizard 
          open={showWizard} 
          onOpenChange={setShowWizard}
          onCreated={() => {}}
        />

        {/* Trading Mode & Leverage Controls */}
        <div className="glass-card p-4">
          <div className="flex flex-wrap items-center gap-6">
            {/* Trading Mode Toggle */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">Trading Mode:</span>
              <div className="flex gap-2">
                <ActionButton 
                  size="sm"
                  variant={tradingMode === 'spot' ? 'default' : 'outline'}
                  onClick={() => handleModeChange('spot')}
                  disabled={isSavingMode}
                  tooltip={BUTTON_TOOLTIPS.spotMode}
                >
                  Spot
                </ActionButton>
                <ActionButton 
                  size="sm"
                  variant={tradingMode === 'futures' ? 'default' : 'outline'}
                  onClick={() => handleModeChange('futures')}
                  disabled={isSavingMode}
                  className={tradingMode === 'futures' ? 'bg-warning hover:bg-warning/90 text-warning-foreground' : ''}
                  tooltip={BUTTON_TOOLTIPS.futuresMode}
                >
                  Futures
                </ActionButton>
              </div>
            </div>

            {/* Global Leverage Slider (only visible for Futures) */}
            {tradingMode === 'futures' && (
              <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                <span className="text-sm font-medium text-muted-foreground">Global Leverage:</span>
                <Slider
                  value={[leverage]}
                  onValueChange={handleGlobalLeverageChange}
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
          {strategies.map((strategy) => {
            const dailyProgress = strategy.daily_goal > 0 
              ? Math.min((strategy.pnl_today / strategy.daily_goal) * 100, 100)
              : 0;
            const goalReached = strategy.pnl_today >= strategy.daily_goal;

            return (
              <div key={strategy.id} className="glass-card-hover p-5 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{strategy.name}</h3>
                      {strategy.source_framework && strategy.source_framework !== 'custom' && (
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[10px] px-1.5 py-0.5",
                            strategy.source_framework === 'freqtrade' && 'border-sky-500 text-sky-500',
                            strategy.source_framework === 'jesse' && 'border-blue-500 text-blue-500',
                            strategy.source_framework === 'vnpy' && 'border-purple-500 text-purple-500',
                            strategy.source_framework === 'superalgos' && 'border-orange-500 text-orange-500',
                            strategy.source_framework === 'backtrader' && 'border-yellow-500 text-yellow-500',
                            strategy.source_framework === 'hummingbot' && 'border-teal-500 text-teal-500'
                          )}
                        >
                          {strategy.source_framework}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{strategy.description}</p>
                    
                    {/* Profit Piranha Strategy Logic Display */}
                    {(strategy.name?.toLowerCase().includes('piranha') || 
                      strategy.name?.toLowerCase().includes('profit')) && (
                      <div className="mt-2 space-y-1 text-xs bg-emerald-500/10 rounded-md p-2 border border-emerald-500/20">
                        <p className="text-emerald-400 font-medium flex items-center gap-1">
                          <Target className="w-3 h-3" />
                          Min Profit: SPOT ${strategy.profit_target || 1} / LEV ${strategy.profit_target_leverage || 3}
                        </p>
                        <p className="text-muted-foreground italic text-[10px]">
                          No closing until profit target reached
                        </p>
                        {strategy.allowed_exchanges && strategy.allowed_exchanges.length > 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            Exchanges: {strategy.allowed_exchanges.join(', ')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {strategy.is_active && !strategy.is_paused ? (
                      <>
                        <StatusDot color="success" pulse size="sm" />
                        <span className="text-xs text-success">Active</span>
                      </>
                    ) : (
                      <>
                        <StatusDot color="warning" size="sm" />
                        <span className="text-xs text-warning">Paused</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Position Size Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Position Size ($)</Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-3 h-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{BUTTON_TOOLTIPS.positionSize}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    type="number"
                    value={strategy.position_size}
                    onChange={(e) => handlePositionSizeChange(strategy.id, e.target.value)}
                    className="h-8 text-sm"
                    min={1}
                  />
                </div>

                {/* Profit Target Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Profit Target ($)</Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Target className="w-3 h-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{BUTTON_TOOLTIPS.profitTarget}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    type="number"
                    value={strategy.profit_target}
                    onChange={(e) => handleProfitTargetChange(strategy.id, e.target.value)}
                    className="h-8 text-sm"
                    min={0.01}
                    step={0.1}
                  />
                </div>

                {/* Daily Goal with Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Daily Goal</Label>
                    <span className={cn(
                      "text-xs font-medium",
                      goalReached ? "text-success" : "text-muted-foreground"
                    )}>
                      ${strategy.pnl_today.toFixed(2)} / ${strategy.daily_goal}
                    </span>
                  </div>
                  <Progress 
                    value={dailyProgress} 
                    className={cn("h-2", goalReached && "bg-success/20")}
                  />
                  <Input
                    type="number"
                    value={strategy.daily_goal}
                    onChange={(e) => handleDailyGoalChange(strategy.id, e.target.value)}
                    className="h-8 text-sm"
                    min={1}
                    placeholder="Set daily goal"
                  />
                </div>

                {/* Leverage Slider (Futures Mode Only) */}
                {tradingMode === 'futures' && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Strategy Leverage</Label>
                      <Badge variant="outline" className="font-mono text-xs">
                        {strategy.leverage || 1}x
                      </Badge>
                    </div>
                    <Slider
                      value={[strategy.leverage || 1]}
                      onValueChange={(v) => handleStrategyLeverageChange(strategy.id, v[0])}
                      min={1}
                      max={20}
                      step={1}
                      className="py-2"
                    />
                  </div>
                )}

                {/* Performance Stats */}
                <div className="space-y-1.5 pt-2 border-t border-border/50">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Win Rate</span>
                    <span className="font-medium">{strategy.win_rate}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Trades Today</span>
                    <span className="font-medium">{strategy.trades_today}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">P&L Today</span>
                    <span className={cn(
                      "font-medium",
                      strategy.pnl_today >= 0 ? 'text-success' : 'text-destructive'
                    )}>
                      {strategy.pnl_today >= 0 ? '+' : ''}${strategy.pnl_today.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <ActionButton 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 gap-1 text-success hover:text-success"
                    onClick={() => handleActivateStrategy(strategy.id)}
                    disabled={activatingId === strategy.id || strategy.is_active}
                    tooltip="Activate this strategy for live trading"
                  >
                    {activatingId === strategy.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    {strategy.is_active ? 'Active' : 'Activate'}
                  </ActionButton>
                  
                  {strategy.is_active && !strategy.is_paused ? (
                    <ActionButton 
                      variant="outline" 
                      size="sm" 
                      className="flex-1 gap-1"
                      onClick={() => handlePauseStrategy(strategy.id)}
                      disabled={loadingId === strategy.id}
                      tooltip={BUTTON_TOOLTIPS.pauseStrategy}
                    >
                      {loadingId === strategy.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Pause className="w-3 h-3" />
                      )}
                      Pause
                    </ActionButton>
                  ) : (
                    <ActionButton 
                      variant="outline" 
                      size="sm" 
                      className="flex-1 gap-1 text-success hover:text-success"
                      onClick={() => handleStartStrategy(strategy.id)}
                      disabled={loadingId === strategy.id}
                      tooltip={BUTTON_TOOLTIPS.startLive}
                    >
                      {loadingId === strategy.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
                      Start
                    </ActionButton>
                  )}
                  
                  <ActionButton 
                    variant="outline" 
                    size="sm" 
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDeleteStrategy(strategy.id)}
                    disabled={loadingId === strategy.id}
                    tooltip={BUTTON_TOOLTIPS.deleteStrategy}
                  >
                    {loadingId === strategy.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                  </ActionButton>
                </div>
              </div>
            );
          })}

          {/* Add New Strategy Card */}
          <div 
            className="glass-card border-dashed p-6 flex flex-col items-center justify-center text-center min-h-[300px] hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => setShowWizard(true)}
          >
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-3">
              <Plus className="w-6 h-6 text-primary" />
            </div>
            <p className="font-medium">Create New Strategy</p>
            <p className="text-sm text-muted-foreground">Visual no-code builder</p>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}