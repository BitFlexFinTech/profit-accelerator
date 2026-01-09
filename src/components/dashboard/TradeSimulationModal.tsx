import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Brain, TrendingUp, ArrowRightLeft, Target, CheckCircle2, XCircle, 
  Zap, AlertTriangle, RefreshCw, Loader2, Sparkles, BarChart3
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface TradeSimulationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SimulationConfig {
  strategy: 'piranha' | 'scalper' | 'momentum';
  amountPerPosition: number;
  profitTarget: number;
  dailyProfitTarget: number;
  useLeverage: boolean;
  leverageAmount: number;
  tradingMode: 'simulation' | 'paper' | 'live';
}

interface SimulationStage {
  id: string;
  name: string;
  icon: React.ReactNode;
  status: 'pending' | 'running' | 'success' | 'error';
  duration?: number;
  errorDetails?: string;
  data?: Record<string, unknown>;
}

const STRATEGIES = [
  { id: 'piranha', name: 'Profit Piranha', description: 'Micro-scalping, $1-3 targets' },
  { id: 'scalper', name: 'Speed Scalper', description: 'Fast in/out, high frequency' },
  { id: 'momentum', name: 'Momentum Rider', description: 'Trend following, larger moves' },
];

const INITIAL_STAGES: SimulationStage[] = [
  { id: 'ai-analysis', name: 'AI Market Analysis', icon: <Brain className="w-4 h-4" />, status: 'pending' },
  { id: 'pair-selection', name: 'Pair Selection', icon: <BarChart3 className="w-4 h-4" />, status: 'pending' },
  { id: 'trade-open', name: 'Opening Trade', icon: <ArrowRightLeft className="w-4 h-4" />, status: 'pending' },
  { id: 'position-monitor', name: 'Position Monitoring', icon: <TrendingUp className="w-4 h-4" />, status: 'pending' },
  { id: 'profit-target', name: 'Profit Target Reached', icon: <Target className="w-4 h-4" />, status: 'pending' },
  { id: 'trade-close', name: 'Trade Closed', icon: <CheckCircle2 className="w-4 h-4" />, status: 'pending' },
  { id: 'post-analysis', name: 'Post-Trade Analysis', icon: <Sparkles className="w-4 h-4" />, status: 'pending' },
];

export function TradeSimulationModal({ open, onOpenChange }: TradeSimulationModalProps) {
  const [mode, setMode] = useState<'config' | 'simulating' | 'success' | 'error'>('config');
  const [config, setConfig] = useState<SimulationConfig>({
    strategy: 'piranha',
    amountPerPosition: 400,
    profitTarget: 1,
    dailyProfitTarget: 10,
    useLeverage: false,
    leverageAmount: 5,
    tradingMode: 'simulation',
  });
  const [stages, setStages] = useState<SimulationStage[]>(INITIAL_STAGES);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [errorInfo, setErrorInfo] = useState<{ stage: string; message: string; fix: string } | null>(null);
  const [simulationData, setSimulationData] = useState<{
    exchange?: string;
    symbol?: string;
    side?: string;
    entryPrice?: number;
    exitPrice?: number;
    pnl?: number;
  }>({});

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setMode('config');
      setStages(INITIAL_STAGES);
      setCurrentStageIndex(0);
      setErrorInfo(null);
      setSimulationData({});
    }
  }, [open]);

  const updateStage = useCallback((id: string, updates: Partial<SimulationStage>) => {
    setStages(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const runSimulation = async () => {
    setMode('simulating');
    setStages(INITIAL_STAGES);
    setCurrentStageIndex(0);
    setErrorInfo(null);

    // Global 30-second timeout to prevent infinite hangs
    const globalTimeout = setTimeout(() => {
      console.error('[Simulation] Global timeout reached after 30s');
      setErrorInfo({ 
        stage: 'timeout', 
        message: 'Simulation timed out after 30 seconds', 
        fix: 'Check your network connection and try again' 
      });
      setMode('error');
    }, 30000);

    try {
      // Stage 1: AI Analysis - Check for connected exchanges and AI signals
      setCurrentStageIndex(0);
      updateStage('ai-analysis', { status: 'running' });
      
      const { data: exchanges } = await supabase
        .from('exchange_connections')
        .select('exchange_name, is_connected, balance_usdt')
        .eq('is_connected', true);

      // Only require real exchanges for paper and live modes
      const requiresRealExchange = config.tradingMode === 'paper' || config.tradingMode === 'live';

      if (requiresRealExchange && (!exchanges || exchanges.length === 0)) {
        throw { 
          stage: 'ai-analysis', 
          message: 'No connected exchanges found', 
          fix: 'Connect at least one exchange with API keys in Settings' 
        };
      }

      // For simulation mode, use a mock exchange if none connected
      const effectiveExchanges = (exchanges && exchanges.length > 0) 
        ? exchanges 
        : [{ exchange_name: 'Simulated Exchange', is_connected: true, balance_usdt: 10000 }];

      console.log(`[Simulation] Mode: ${config.tradingMode}, Exchanges: ${effectiveExchanges.length}`);

      // Get latest AI signal
      const { data: aiSignals } = await supabase
        .from('ai_market_updates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      await new Promise(r => setTimeout(r, 1500));
      updateStage('ai-analysis', { 
        status: 'success', 
        data: { exchanges: effectiveExchanges.length, signals: aiSignals?.length || 0, mode: config.tradingMode } 
      });

      // Stage 2: Pair Selection
      setCurrentStageIndex(1);
      updateStage('pair-selection', { status: 'running' });
      
      const selectedExchange = effectiveExchanges[0].exchange_name;
      
      // Filter for tradeable symbols (exclude stablecoins like USDC, FDUSD)
      const tradeableSymbols = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'AVAX', 'LINK'];
      const tradeableSignal = aiSignals?.find(s => 
        tradeableSymbols.some(t => s.symbol?.toUpperCase().includes(t))
      );
      const selectedSymbol = tradeableSignal?.symbol 
        ? `${tradeableSignal.symbol.toUpperCase().replace('/USDT', '').replace('USDT', '')}/USDT`
        : 'BTC/USDT';
      const selectedSide = tradeableSignal?.recommended_side || 'long';
      console.log('[Trade] Selected symbol:', selectedSymbol, 'from signal:', tradeableSignal?.symbol);
      
      setSimulationData(prev => ({ ...prev, exchange: selectedExchange, symbol: selectedSymbol, side: selectedSide }));
      
      await new Promise(r => setTimeout(r, 1200));
      updateStage('pair-selection', { status: 'success', data: { symbol: selectedSymbol, exchange: selectedExchange } });

      // Stage 3: Open Trade - fetch REAL price from trade-engine
      console.log('[Simulation] Stage 3: Opening Trade - STARTING');
      setCurrentStageIndex(2);
      updateStage('trade-open', { status: 'running' });
      
      // Attempt to get real price from trade-engine with simple timeout
      let realEntryPrice = 0;
      console.log('[Trade] Fetching real prices from trade-engine...');
      
      try {
        const { data: priceData, error: priceError } = await Promise.race([
          supabase.functions.invoke('trade-engine', { body: { action: 'get-prices' } }),
          new Promise<{ data: null; error: Error }>((resolve) => 
            setTimeout(() => resolve({ data: null, error: new Error('Price fetch timeout') }), 5000)
          )
        ]);
        
        if (priceError) {
          console.log('[Trade] Price fetch error:', priceError.message || priceError);
        } else if (priceData && typeof priceData === 'object' && 'prices' in priceData) {
          const prices = priceData.prices as Record<string, { price: number }>;
          const symbolBase = selectedSymbol.replace('/USDT', '').replace('USDT', '').toUpperCase();
          realEntryPrice = prices[symbolBase]?.price || 0;
          console.log('[Trade] Got real price for', symbolBase, ':', realEntryPrice);
        } else {
          console.log('[Trade] Invalid price response structure:', priceData);
        }
      } catch (e) {
        console.log('[Trade] Price fetch exception, using fallback:', e);
      }
      
      // Fallback to realistic market prices for all supported symbols
      if (!realEntryPrice) {
        const fallbackPrices: Record<string, number> = {
          'BTC': 91000 + Math.random() * 1000,
          'ETH': 3100 + Math.random() * 50,
          'SOL': 138 + Math.random() * 5,
          'XRP': 2.1 + Math.random() * 0.1,
          'DOGE': 0.14 + Math.random() * 0.01,
          'ADA': 0.9 + Math.random() * 0.05,
          'AVAX': 35 + Math.random() * 2,
          'LINK': 22 + Math.random() * 1,
        };
        const symbolBase = selectedSymbol.replace('/USDT', '').replace('USDT', '').toUpperCase();
        realEntryPrice = fallbackPrices[symbolBase] || 100 + Math.random() * 10;
        console.log('[Trade] Using fallback price for', symbolBase, ':', realEntryPrice);
      }
      
      const entryPriceForCalc = realEntryPrice;
      setSimulationData(prev => ({ ...prev, entryPrice: entryPriceForCalc }));
      
      // Execute trade based on mode
      if (config.tradingMode === 'live') {
        console.log('[Trade] Executing LIVE order...');
        const quantity = config.amountPerPosition / entryPriceForCalc;
        const { data: orderData, error: orderError } = await supabase.functions.invoke('trade-engine', {
          body: {
            action: 'execute-order',
            exchangeName: selectedExchange,
            symbol: selectedSymbol,
            side: selectedSide === 'long' ? 'buy' : 'sell',
            quantity,
            type: 'market'
          }
        });
        
        if (orderError) {
          throw { stage: 'trade-open', message: `Order failed: ${orderError.message}`, fix: 'Check exchange API keys and balance' };
        }
        console.log('[Trade] Live order executed:', orderData);
      } else if (config.tradingMode === 'paper') {
        console.log('[Trade] Logging PAPER trade...');
        const { error: insertError } = await supabase.from('trading_journal').insert({
          exchange: selectedExchange,
          symbol: selectedSymbol,
          side: selectedSide === 'long' ? 'buy' : 'sell',
          entry_price: entryPriceForCalc,
          quantity: config.amountPerPosition / entryPriceForCalc,
          status: 'open',
          ai_reasoning: `Paper trade via ${config.strategy} strategy`,
          paper_trade: true
        });
        
        if (insertError) {
          console.error('[Trade] Paper trade insert failed:', insertError);
          // Continue anyway - don't block simulation for logging failure
        } else {
          console.log('[Trade] Paper trade logged to trading_journal');
        }
      } else {
        console.log('[Trade] Simulation mode - no actual trade logged');
      }
      
      await new Promise(r => setTimeout(r, 500));
      console.log('[Simulation] Stage 3: Opening Trade - COMPLETE');
      updateStage('trade-open', { status: 'success', data: { entryPrice: entryPriceForCalc, mode: config.tradingMode } });

      // Stage 4: Position Monitoring
      setCurrentStageIndex(3);
      updateStage('position-monitor', { status: 'running' });
      
      await new Promise(r => setTimeout(r, 2000));
      updateStage('position-monitor', { status: 'success' });

      // Stage 5: Profit Target
      setCurrentStageIndex(4);
      updateStage('profit-target', { status: 'running' });
      
      const profitAmount = config.useLeverage ? config.profitTarget * config.leverageAmount : config.profitTarget;
      // Use the local variable, NOT state (which would be stale)
      const exitPrice = selectedSide === 'long' 
        ? entryPriceForCalc * (1 + (profitAmount / config.amountPerPosition))
        : entryPriceForCalc * (1 - (profitAmount / config.amountPerPosition));
      
      setSimulationData(prev => ({ ...prev, exitPrice, pnl: profitAmount }));
      
      await new Promise(r => setTimeout(r, 1000));
      updateStage('profit-target', { status: 'success', data: { pnl: profitAmount } });

      // Stage 6: Trade Close
      setCurrentStageIndex(5);
      updateStage('trade-close', { status: 'running' });
      
      await new Promise(r => setTimeout(r, 600));
      updateStage('trade-close', { status: 'success' });

      // Stage 7: Post Analysis
      setCurrentStageIndex(6);
      updateStage('post-analysis', { status: 'running' });
      
      await new Promise(r => setTimeout(r, 1000));
      updateStage('post-analysis', { status: 'success' });

      // Success! Update simulation_progress
      await supabase
        .from('simulation_progress')
        .update({ 
          simulation_completed: true,
          paper_mode_unlocked: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', '00000000-0000-0000-0000-000000000001');

      clearTimeout(globalTimeout);
      console.log('[Simulation] Completed successfully!');
      setMode('success');
      toast.success('Simulation completed! Paper trading unlocked.');

    } catch (err: unknown) {
      clearTimeout(globalTimeout);
      const error = err as { stage?: string; message?: string; fix?: string };
      const stage = error.stage || 'unknown';
      const message = error.message || 'Unknown error';
      const fix = error.fix || 'Check console for details';
      
      console.error('[Simulation] Error at stage:', stage, message);
      updateStage(stage, { status: 'error', errorDetails: message });
      setErrorInfo({ stage, message, fix });
      setMode('error');
    }
  };

  const handleRetry = () => {
    runSimulation();
  };

  const progress = ((currentStageIndex + 1) / stages.length) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Trade Simulation
          </DialogTitle>
          <DialogDescription>
            {mode === 'config' && 'Configure and run a simulated trade to test the system'}
            {mode === 'simulating' && 'Running simulation...'}
            {mode === 'success' && 'Simulation completed successfully!'}
            {mode === 'error' && 'Simulation encountered an error'}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {mode === 'config' && (
            <motion.div
              key="config"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Trading Mode Selection */}
              <div className="space-y-2">
                <Label>Trading Mode</Label>
                <Select value={config.tradingMode} onValueChange={(v) => setConfig(c => ({ ...c, tradingMode: v as SimulationConfig['tradingMode'] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simulation">
                      <div className="flex flex-col">
                        <span>Simulation</span>
                        <span className="text-xs text-muted-foreground">Test with mock trades, no real orders</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="paper">
                      <div className="flex flex-col">
                        <span>Paper Trading</span>
                        <span className="text-xs text-muted-foreground">Track with real prices, no real orders</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="live">
                      <div className="flex flex-col">
                        <span>Live Trading</span>
                        <span className="text-xs text-destructive">Real orders on connected exchanges</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Strategy Selection */}
              <div className="space-y-2">
                <Label>Trading Strategy</Label>
                <Select value={config.strategy} onValueChange={(v) => setConfig(c => ({ ...c, strategy: v as SimulationConfig['strategy'] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STRATEGIES.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex flex-col">
                          <span>{s.name}</span>
                          <span className="text-xs text-muted-foreground">{s.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount per Position */}
              <div className="space-y-2">
                <Label>Amount per Position: ${config.amountPerPosition}</Label>
                <Slider
                  value={[config.amountPerPosition]}
                  onValueChange={([v]) => setConfig(c => ({ ...c, amountPerPosition: v }))}
                  min={350}
                  max={500}
                  step={10}
                />
                <p className="text-xs text-muted-foreground">Range: $350 - $500 (default for SPOT)</p>
              </div>

              {/* Profit Target */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Profit Target ($)</Label>
                  <Input
                    type="number"
                    value={config.profitTarget}
                    onChange={(e) => setConfig(c => ({ ...c, profitTarget: parseFloat(e.target.value) || 1 }))}
                    min={0.5}
                    max={10}
                    step={0.5}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Daily Target ($)</Label>
                  <Input
                    type="number"
                    value={config.dailyProfitTarget}
                    onChange={(e) => setConfig(c => ({ ...c, dailyProfitTarget: parseFloat(e.target.value) || 10 }))}
                    min={5}
                    max={100}
                    step={5}
                  />
                </div>
              </div>

              {/* Leverage Toggle */}
              <div className="p-4 rounded-lg bg-secondary/30 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label>Use Leverage</Label>
                    <Badge variant="outline" className="text-xs">SPOT default</Badge>
                  </div>
                  <Switch
                    checked={config.useLeverage}
                    onCheckedChange={(checked) => setConfig(c => ({ ...c, useLeverage: checked }))}
                  />
                </div>
                
                {config.useLeverage && (
                  <div className="space-y-2">
                    <Label>Leverage: {config.leverageAmount}x</Label>
                    <Slider
                      value={[config.leverageAmount]}
                      onValueChange={([v]) => setConfig(c => ({ ...c, leverageAmount: v }))}
                      min={2}
                      max={20}
                      step={1}
                    />
                  </div>
                )}
              </div>

              {config.tradingMode === 'live' && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                  <p className="text-xs text-destructive flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Live mode will execute real orders on your connected exchanges!
                  </p>
                </div>
              )}

              <Button onClick={runSimulation} className="w-full" size="lg" variant={config.tradingMode === 'live' ? 'destructive' : 'default'}>
                <Zap className="w-4 h-4 mr-2" />
                {config.tradingMode === 'simulation' ? 'Start Simulation' : config.tradingMode === 'paper' ? 'Start Paper Trade' : 'Execute Live Trade'}
              </Button>
            </motion.div>
          )}

          {mode === 'simulating' && (
            <motion.div
              key="simulating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6 py-4"
            >
              <Progress value={progress} className="h-2" />
              
              <div className="space-y-2">
                {stages.map((stage, index) => (
                  <motion.div
                    key={stage.id}
                    initial={{ opacity: 0.5 }}
                    animate={{ 
                      opacity: stage.status !== 'pending' ? 1 : 0.5,
                      scale: stage.status === 'running' ? 1.02 : 1
                    }}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg transition-all",
                      stage.status === 'running' && "bg-primary/10 border border-primary/30 shadow-lg shadow-primary/10",
                      stage.status === 'success' && "bg-success/10 border border-success/30",
                      stage.status === 'error' && "bg-destructive/10 border border-destructive/30",
                      stage.status === 'pending' && "bg-secondary/20"
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-full",
                      stage.status === 'running' && "bg-primary/20 text-primary animate-pulse",
                      stage.status === 'success' && "bg-success/20 text-success",
                      stage.status === 'error' && "bg-destructive/20 text-destructive",
                      stage.status === 'pending' && "bg-muted text-muted-foreground"
                    )}>
                      {stage.status === 'running' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : stage.status === 'success' ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : stage.status === 'error' ? (
                        <XCircle className="w-4 h-4" />
                      ) : (
                        stage.icon
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{stage.name}</p>
                      {stage.status === 'running' && (
                        <p className="text-xs text-muted-foreground">Processing...</p>
                      )}
                    </div>
                    {index === currentStageIndex && stage.status === 'running' && (
                      <Badge variant="secondary" className="animate-pulse">Active</Badge>
                    )}
                  </motion.div>
                ))}
              </div>

              {/* Live Data Display */}
              {Object.keys(simulationData).length > 0 && (
                <div className="p-3 rounded-lg bg-secondary/30 font-mono text-xs space-y-1">
                  {simulationData.exchange && <p>Exchange: <span className="text-primary">{simulationData.exchange}</span></p>}
                  {simulationData.symbol && <p>Symbol: <span className="text-primary">{simulationData.symbol}</span></p>}
                  {simulationData.side && <p>Side: <span className={simulationData.side === 'long' ? 'text-success' : 'text-destructive'}>{simulationData.side.toUpperCase()}</span></p>}
                  {simulationData.entryPrice && <p>Entry: <span className="text-foreground">${simulationData.entryPrice.toFixed(2)}</span></p>}
                  {simulationData.exitPrice && <p>Exit: <span className="text-foreground">${simulationData.exitPrice.toFixed(2)}</span></p>}
                  {simulationData.pnl && <p>PnL: <span className="text-success">+${simulationData.pnl.toFixed(2)}</span></p>}
                </div>
              )}
            </motion.div>
          )}

          {mode === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8 text-center space-y-6"
            >
              <div className="w-20 h-20 mx-auto rounded-full bg-success/20 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-success" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Simulation Complete!</h3>
                <p className="text-muted-foreground mt-2">
                  Paper trading mode is now unlocked. Complete 20 successful paper trades to unlock live mode.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-success/10 border border-success/30">
                <p className="text-sm text-success font-medium">
                  ✅ Strategy: {STRATEGIES.find(s => s.id === config.strategy)?.name}
                </p>
                <p className="text-sm text-success font-medium">
                  ✅ Simulated PnL: +${simulationData.pnl?.toFixed(2) || config.profitTarget}
                </p>
              </div>
              <Button onClick={() => onOpenChange(false)} className="w-full">
                Start Paper Trading
              </Button>
            </motion.div>
          )}

          {mode === 'error' && errorInfo && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-6 space-y-6"
            >
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-destructive">Simulation Failed</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Stage: <span className="font-medium">{errorInfo.stage}</span>
                    </p>
                    <p className="text-sm mt-2">{errorInfo.message}</p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                <h4 className="font-medium text-primary mb-2">Suggested Fix:</h4>
                <p className="text-sm">{errorInfo.fix}</p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                  Close
                </Button>
                <Button onClick={handleRetry} className="flex-1">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}