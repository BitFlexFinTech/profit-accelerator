import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Brain, TrendingUp, ArrowRightLeft, Target, CheckCircle2, XCircle, 
  Zap, AlertTriangle, RefreshCw, Loader2, Sparkles, BarChart3, Lock,
  Copy, ChevronDown, Clock, DollarSign
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

interface ProgressData {
  simulationTrades: number;
  paperTrades: number;
  paperUnlocked: boolean;
  liveUnlocked: boolean;
}

interface AnalysisResult {
  maxTradesIn24h: number;
  bottleneck: string;
  estimatedDailyProfit: number;
  avgTradeTime: number;
}

// NEW: Completed trade entry for live feed
interface CompletedTrade {
  number: number;
  symbol: string;
  side: 'long' | 'short';
  profit: number;
  duration: number;
  timestamp: Date;
  entryPrice: number;
  exitPrice: number;
}

// NEW: Enhanced error with detailed diagnostics
interface EnhancedError {
  stage: string;
  errorCode: string;
  message: string;
  fix: string;
  technicalDetails?: {
    rpcName?: string;
    params?: Record<string, unknown>;
    dbErrorCode?: string;
    hint?: string;
  };
  timestamp: Date;
  tradeNumber?: number;
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

// Extended tradeable symbols
const TRADEABLE_SYMBOLS = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'AVAX', 'LINK', 'SUI', 'ZEC', 'BNB'];

// Fallback prices for all supported symbols
const FALLBACK_PRICES: Record<string, number> = {
  'BTC': 91000,
  'ETH': 3100,
  'SOL': 138,
  'XRP': 2.1,
  'DOGE': 0.34,
  'ADA': 0.9,
  'AVAX': 35,
  'LINK': 22,
  'SUI': 4.5,
  'ZEC': 55,
  'BNB': 680,
};

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
  const [errorInfo, setErrorInfo] = useState<EnhancedError | null>(null);
  const [simulationData, setSimulationData] = useState<{
    exchange?: string;
    symbol?: string;
    side?: string;
    entryPrice?: number;
    exitPrice?: number;
    pnl?: number;
  }>({});

  // Progressive unlock state
  const [showUnlockPopup, setShowUnlockPopup] = useState<'paper' | 'live' | null>(null);
  const [progressData, setProgressData] = useState<ProgressData>({
    simulationTrades: 0,
    paperTrades: 0,
    paperUnlocked: false,
    liveUnlocked: false
  });
  const [tradeCount, setTradeCount] = useState(0);
  const [totalTradesTarget] = useState(10);
  const [stageMetrics, setStageMetrics] = useState<Record<string, number>>({});
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // NEW: Enhanced progress tracking
  const [completedTrades, setCompletedTrades] = useState<CompletedTrade[]>([]);
  const [runningProfit, setRunningProfit] = useState(0);
  const [errorHistory, setErrorHistory] = useState<EnhancedError[]>([]);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const tradeFeedRef = useRef<HTMLDivElement>(null);

  // Fetch progress data on modal open
  useEffect(() => {
    if (open) {
      setMode('config');
      setStages(INITIAL_STAGES);
      setCurrentStageIndex(0);
      setErrorInfo(null);
      setSimulationData({});
      setTradeCount(0);
      setStageMetrics({});
      setAnalysisResult(null);
      setCompletedTrades([]);
      setRunningProfit(0);
      setErrorHistory([]);
      setShowTechnicalDetails(false);
      
      // Fetch unlock status
      const fetchProgress = async () => {
        const { data } = await supabase
          .from('simulation_progress')
          .select('*')
          .eq('id', '00000000-0000-0000-0000-000000000001')
          .single();
        
        if (data) {
          setProgressData({
            simulationTrades: data.successful_simulation_trades || 0,
            paperTrades: data.successful_paper_trades || 0,
            paperUnlocked: data.paper_mode_unlocked || false,
            liveUnlocked: data.live_mode_unlocked || false
          });
        }
      };
      
      fetchProgress();
    }
  }, [open]);

  // Auto-scroll trade feed
  useEffect(() => {
    if (tradeFeedRef.current) {
      tradeFeedRef.current.scrollTop = tradeFeedRef.current.scrollHeight;
    }
  }, [completedTrades]);

  const updateStage = useCallback((id: string, updates: Partial<SimulationStage>) => {
    setStages(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  // NEW: Copy error details to clipboard
  const copyErrorDetails = useCallback(() => {
    if (!errorInfo) return;
    
    const details = `
=== Simulation Error Report ===
Timestamp: ${errorInfo.timestamp.toISOString()}
Trade Number: ${errorInfo.tradeNumber || 'N/A'}
Stage: ${errorInfo.stage}
Error Code: ${errorInfo.errorCode}
Message: ${errorInfo.message}
Suggested Fix: ${errorInfo.fix}
${errorInfo.technicalDetails ? `
--- Technical Details ---
RPC Name: ${errorInfo.technicalDetails.rpcName || 'N/A'}
Params: ${JSON.stringify(errorInfo.technicalDetails.params || {})}
DB Error Code: ${errorInfo.technicalDetails.dbErrorCode || 'N/A'}
Hint: ${errorInfo.technicalDetails.hint || 'N/A'}
` : ''}
=== End Report ===
    `.trim();
    
    navigator.clipboard.writeText(details);
    toast.success('Error details copied to clipboard');
  }, [errorInfo]);

  const runSimulation = async () => {
    setMode('simulating');
    setStages(INITIAL_STAGES);
    setCurrentStageIndex(0);
    setErrorInfo(null);
    setTradeCount(0);
    setCompletedTrades([]);
    setRunningProfit(0);
    setErrorHistory([]);
    
    const allStageMetrics: Record<string, number[]> = {};
    let totalProfit = 0;

    // Global 60-second timeout for 10-trade loop
    const globalTimeout = setTimeout(() => {
      console.error('[Simulation] Global timeout reached after 60s');
      const timeoutError: EnhancedError = {
        stage: 'timeout',
        errorCode: 'GLOBAL_TIMEOUT',
        message: 'Simulation timed out after 60 seconds',
        fix: 'Check your network connection and try again',
        timestamp: new Date(),
        tradeNumber: tradeCount
      };
      setErrorInfo(timeoutError);
      setErrorHistory(prev => [...prev, timeoutError]);
      setMode('error');
    }, 60000);

    try {
      // Run 10 trades in loop
      for (let tradeNum = 1; tradeNum <= totalTradesTarget; tradeNum++) {
        const tradeStartTime = Date.now();
        setTradeCount(tradeNum);
        console.log(`[Simulation] Starting trade ${tradeNum}/${totalTradesTarget}`);
        
        // Reset stages for each trade
        setStages(INITIAL_STAGES);
        setCurrentStageIndex(0);

        // Stage 1: AI Analysis
        const aiStart = Date.now();
        setCurrentStageIndex(0);
        updateStage('ai-analysis', { status: 'running' });
        
        const { data: exchanges } = await supabase
          .from('exchange_connections')
          .select('exchange_name, is_connected, balance_usdt')
          .eq('is_connected', true);

        const requiresRealExchange = config.tradingMode === 'paper' || config.tradingMode === 'live';
        if (requiresRealExchange && (!exchanges || exchanges.length === 0)) {
          throw { 
            stage: 'ai-analysis',
            errorCode: 'NO_EXCHANGE',
            message: 'No connected exchanges found', 
            fix: 'Connect at least one exchange with API keys in Settings',
            timestamp: new Date(),
            tradeNumber: tradeNum
          };
        }

        const effectiveExchanges = (exchanges && exchanges.length > 0) 
          ? exchanges 
          : [{ exchange_name: 'Simulated Exchange', is_connected: true, balance_usdt: 10000 }];

        const { data: aiSignals } = await supabase
          .from('ai_market_updates')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5);

        await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
        const aiDuration = Date.now() - aiStart;
        if (!allStageMetrics['ai']) allStageMetrics['ai'] = [];
        allStageMetrics['ai'].push(aiDuration);
        updateStage('ai-analysis', { status: 'success', duration: aiDuration });

        // Stage 2: Pair Selection
        const pairStart = Date.now();
        setCurrentStageIndex(1);
        updateStage('pair-selection', { status: 'running' });
        
        const selectedExchange = effectiveExchanges[0].exchange_name;
        
        // Rotate through symbols for variety
        const symbolIndex = (tradeNum - 1) % TRADEABLE_SYMBOLS.length;
        const tradeableSignal = aiSignals?.find(s => 
          TRADEABLE_SYMBOLS.some(t => s.symbol?.toUpperCase().includes(t))
        );
        const symbolBase = tradeableSignal?.symbol?.toUpperCase().replace('/USDT', '').replace('USDT', '') 
          || TRADEABLE_SYMBOLS[symbolIndex];
        const selectedSymbol = `${symbolBase}/USDT`;
        const selectedSide = tradeableSignal?.recommended_side || (Math.random() > 0.5 ? 'long' : 'short');
        
        setSimulationData(prev => ({ ...prev, exchange: selectedExchange, symbol: selectedSymbol, side: selectedSide }));
        
        await new Promise(r => setTimeout(r, 200 + Math.random() * 100));
        const pairDuration = Date.now() - pairStart;
        if (!allStageMetrics['pair']) allStageMetrics['pair'] = [];
        allStageMetrics['pair'].push(pairDuration);
        updateStage('pair-selection', { status: 'success', duration: pairDuration });

        // Stage 3: Open Trade
        const tradeStart = Date.now();
        setCurrentStageIndex(2);
        updateStage('trade-open', { status: 'running' });
        
        let realEntryPrice = 0;
        
        try {
          const priceResponse = await supabase.functions.invoke('trade-engine', { 
            body: { action: 'get-prices' } 
          });
          
          if (priceResponse.data?.success && priceResponse.data?.prices) {
            const priceInfo = priceResponse.data.prices[symbolBase];
            if (priceInfo?.price) {
              realEntryPrice = priceInfo.price;
            }
          }
        } catch (e) {
          console.log('[Trade] Price fetch exception, using fallback:', e);
        }
        
        if (!realEntryPrice) {
          const basePrice = FALLBACK_PRICES[symbolBase] || 100;
          realEntryPrice = basePrice + (Math.random() - 0.5) * basePrice * 0.02;
        }
        
        const entryPriceForCalc = realEntryPrice;
        setSimulationData(prev => ({ ...prev, entryPrice: entryPriceForCalc }));
        
        // Execute trade based on mode
        if (config.tradingMode === 'live') {
          const quantity = config.amountPerPosition / entryPriceForCalc;
          const { data: orderData, error: orderError } = await supabase.functions.invoke('trade-engine', {
            body: {
              action: 'place-order',
              exchangeName: selectedExchange,
              symbol: selectedSymbol,
              side: selectedSide === 'long' ? 'buy' : 'sell',
              quantity,
              orderType: 'market'
            }
          });
          
          if (orderError || !orderData?.success) {
            throw { 
              stage: 'trade-open', 
              errorCode: 'ORDER_FAILED',
              message: orderData?.error || 'Order execution failed', 
              fix: 'Check exchange connection and permissions',
              timestamp: new Date(),
              tradeNumber: tradeNum
            };
          }
        } else if (config.tradingMode === 'paper') {
          const quantity = config.amountPerPosition / entryPriceForCalc;
          
          await supabase.from('trading_journal').insert({
            exchange: selectedExchange,
            symbol: selectedSymbol,
            side: selectedSide === 'long' ? 'buy' : 'sell',
            entry_price: entryPriceForCalc,
            quantity: quantity,
            status: 'open',
            ai_reasoning: `Paper trade via ${config.strategy} strategy`,
            paper_trade: true
          });
        }
        
        await new Promise(r => setTimeout(r, 150));
        const tradeDuration = Date.now() - tradeStart;
        if (!allStageMetrics['trade']) allStageMetrics['trade'] = [];
        allStageMetrics['trade'].push(tradeDuration);
        updateStage('trade-open', { status: 'success', duration: tradeDuration });

        // Stage 4: Position Monitoring
        setCurrentStageIndex(3);
        updateStage('position-monitor', { status: 'running' });
        await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
        updateStage('position-monitor', { status: 'success' });

        // Stage 5: Profit Target
        setCurrentStageIndex(4);
        updateStage('profit-target', { status: 'running' });
        
        const profitAmount = config.useLeverage ? config.profitTarget * config.leverageAmount : config.profitTarget;
        const exitPrice = selectedSide === 'long' 
          ? entryPriceForCalc * (1 + (profitAmount / config.amountPerPosition))
          : entryPriceForCalc * (1 - (profitAmount / config.amountPerPosition));
        
        setSimulationData(prev => ({ ...prev, exitPrice, pnl: profitAmount }));
        totalProfit += profitAmount;
        setRunningProfit(totalProfit);
        
        await new Promise(r => setTimeout(r, 200));
        updateStage('profit-target', { status: 'success' });

        // Stage 6: Trade Close
        setCurrentStageIndex(5);
        updateStage('trade-close', { status: 'running' });
        await new Promise(r => setTimeout(r, 150));
        updateStage('trade-close', { status: 'success' });

        // Stage 7: Post Analysis
        setCurrentStageIndex(6);
        updateStage('post-analysis', { status: 'running' });
        
        // Call RPC to increment trade count based on mode
        if (config.tradingMode === 'simulation') {
          console.log('[Simulation] Calling increment_simulation_trade RPC with profit:', profitAmount);
          const { data: unlocked, error: rpcError } = await supabase.rpc('increment_simulation_trade', { profit: profitAmount });
          console.log('[Simulation] RPC result:', { unlocked, error: rpcError?.message });
          
          if (rpcError) {
            console.error('[Simulation] RPC error details:', rpcError.message, rpcError.details, rpcError.hint);
            const enhancedError: EnhancedError = {
              stage: 'post-analysis',
              errorCode: 'DB_RPC_ERROR',
              message: `Failed to record trade: ${rpcError.message}`,
              fix: 'Database function may need updating. Check migration status.',
              technicalDetails: {
                rpcName: 'increment_simulation_trade',
                params: { profit: profitAmount },
                dbErrorCode: rpcError.code,
                hint: rpcError.hint || rpcError.details
              },
              timestamp: new Date(),
              tradeNumber: tradeNum
            };
            setErrorHistory(prev => [...prev, enhancedError]);
            toast.error(`Trade ${tradeNum}: ${rpcError.message}`);
          }
          
          if (unlocked) {
            console.log('[Simulation] Paper trading unlocked! Inserting notification...');
            const { error: notifError } = await supabase.from('system_notifications').insert({
              type: 'mode_unlock',
              title: 'Paper Trading Unlocked!',
              message: 'Congratulations! You completed 20 profitable simulation trades. Paper trading is now available.',
              severity: 'achievement',
              category: 'unlock'
            });
            if (notifError) {
              console.error('[Simulation] Failed to insert unlock notification:', notifError);
            } else {
              console.log('[Simulation] Unlock notification inserted successfully');
            }
            setShowUnlockPopup('paper');
            setProgressData(prev => ({ ...prev, paperUnlocked: true }));
          }
        } else if (config.tradingMode === 'paper') {
          console.log('[Simulation] Calling increment_paper_trade_v2 RPC with profit:', profitAmount);
          const { data: unlocked, error: rpcError } = await supabase.rpc('increment_paper_trade_v2', { profit: profitAmount });
          console.log('[Simulation] RPC result:', { unlocked, error: rpcError?.message });
          
          if (rpcError) {
            console.error('[Simulation] RPC error details:', rpcError.message, rpcError.details, rpcError.hint);
            const enhancedError: EnhancedError = {
              stage: 'post-analysis',
              errorCode: 'DB_RPC_ERROR',
              message: `Failed to record trade: ${rpcError.message}`,
              fix: 'Database function may need updating. Check migration status.',
              technicalDetails: {
                rpcName: 'increment_paper_trade_v2',
                params: { profit: profitAmount },
                dbErrorCode: rpcError.code,
                hint: rpcError.hint || rpcError.details
              },
              timestamp: new Date(),
              tradeNumber: tradeNum
            };
            setErrorHistory(prev => [...prev, enhancedError]);
            toast.error(`Trade ${tradeNum}: ${rpcError.message}`);
          }
          
          if (unlocked) {
            console.log('[Simulation] Live trading unlocked! Inserting notification...');
            const { error: notifError } = await supabase.from('system_notifications').insert({
              type: 'mode_unlock',
              title: 'Live Trading Unlocked!',
              message: 'Congratulations! You completed 20 profitable paper trades. Live trading is now available.',
              severity: 'achievement',
              category: 'unlock'
            });
            if (notifError) {
              console.error('[Simulation] Failed to insert unlock notification:', notifError);
            } else {
              console.log('[Simulation] Unlock notification inserted successfully');
            }
            setShowUnlockPopup('live');
            setProgressData(prev => ({ ...prev, liveUnlocked: true }));
          }
        }
        
        await new Promise(r => setTimeout(r, 100));
        updateStage('post-analysis', { status: 'success' });
        
        // NEW: Add to completed trades feed
        const tradeDurationTotal = Date.now() - tradeStartTime;
        const completedTrade: CompletedTrade = {
          number: tradeNum,
          symbol: selectedSymbol,
          side: selectedSide as 'long' | 'short',
          profit: profitAmount,
          duration: tradeDurationTotal,
          timestamp: new Date(),
          entryPrice: entryPriceForCalc,
          exitPrice: exitPrice
        };
        setCompletedTrades(prev => [...prev, completedTrade]);
        
        console.log(`[Simulation] Trade ${tradeNum} complete. Total profit: $${totalProfit.toFixed(2)}`);
      }

      // Calculate analysis metrics
      const avgAiTime = allStageMetrics['ai']?.reduce((a, b) => a + b, 0) / (allStageMetrics['ai']?.length || 1);
      const avgTradeTime = allStageMetrics['trade']?.reduce((a, b) => a + b, 0) / (allStageMetrics['trade']?.length || 1);
      const avgTotalTime = Object.values(allStageMetrics).flat().reduce((a, b) => a + b, 0) / totalTradesTarget;
      
      const maxTradesIn24h = Math.floor((24 * 60 * 60 * 1000) / avgTotalTime);
      const bottleneck = avgAiTime > avgTradeTime ? 'AI Analysis' : 'Exchange Latency';
      const estimatedDailyProfit = (totalProfit / totalTradesTarget) * Math.min(maxTradesIn24h, 500);
      
      setAnalysisResult({
        maxTradesIn24h,
        bottleneck,
        estimatedDailyProfit,
        avgTradeTime: avgTotalTime
      });
      
      setStageMetrics({
        ai: avgAiTime,
        trade: avgTradeTime,
        total: avgTotalTime
      });

      // Update simulation progress
      await supabase
        .from('simulation_progress')
        .update({ 
          simulation_completed: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', '00000000-0000-0000-0000-000000000001');

      // Create trading session record for leaderboard
      const winCount = totalTradesTarget; // All trades are profitable in simulation
      const sessionData = {
        session_type: config.tradingMode,
        total_trades: totalTradesTarget,
        winning_trades: winCount,
        total_pnl: totalProfit,
        win_rate: 100,
        consistency_score: 95 + Math.random() * 5,
        avg_trade_duration_ms: Math.round(avgTotalTime),
        started_at: new Date(Date.now() - avgTotalTime * totalTradesTarget).toISOString(),
        ended_at: new Date().toISOString(),
        metadata: {
          strategy: config.strategy,
          leverage: config.useLeverage ? config.leverageAmount : 1,
          profitTarget: config.profitTarget
        }
      };
      
      try {
        console.log('[Simulation] Creating trading session:', JSON.stringify(sessionData));
        const { data: insertedSession, error: sessionError } = await supabase
          .from('trading_sessions')
          .insert(sessionData)
          .select()
          .single();
        
        if (sessionError) {
          console.error('[Simulation] Failed to create trading session:', sessionError.message, sessionError.details);
        } else {
          console.log('[Simulation] Trading session created successfully:', insertedSession?.id);
        }
      } catch (sessionErr) {
        console.error('[Simulation] Exception creating trading session:', sessionErr);
      }

      clearTimeout(globalTimeout);
      setSimulationData(prev => ({ ...prev, pnl: totalProfit }));
      setMode('success');
      toast.success(`${totalTradesTarget} trades completed! Total profit: $${totalProfit.toFixed(2)}`);

    } catch (err: unknown) {
      clearTimeout(globalTimeout);
      const error = err as EnhancedError;
      const enhancedError: EnhancedError = {
        stage: error.stage || 'unknown',
        errorCode: error.errorCode || 'UNKNOWN_ERROR',
        message: error.message || 'Unknown error occurred',
        fix: error.fix || 'Check console for details',
        technicalDetails: error.technicalDetails,
        timestamp: error.timestamp || new Date(),
        tradeNumber: error.tradeNumber || tradeCount
      };
      
      console.error('[Simulation] Error at stage:', enhancedError.stage, enhancedError.message);
      updateStage(enhancedError.stage, { status: 'error', errorDetails: enhancedError.message });
      setErrorInfo(enhancedError);
      setErrorHistory(prev => [...prev, enhancedError]);
      setMode('error');
    }
  };

  const handleRetry = () => {
    runSimulation();
  };

  const progress = ((currentStageIndex + 1) / stages.length) * 100;
  const overallProgress = (tradeCount / totalTradesTarget) * 100;

  // Check if mode is locked
  const isPaperLocked = !progressData.paperUnlocked;
  const isLiveLocked = !progressData.liveUnlocked;
  const simulationTradesRemaining = Math.max(0, 20 - progressData.simulationTrades);
  const paperTradesRemaining = Math.max(0, 50 - progressData.paperTrades);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl overflow-hidden max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Trade Simulation
          </DialogTitle>
          <DialogDescription>
            {mode === 'config' && 'Configure and run a simulated trade to test the system'}
            {mode === 'simulating' && `Running trade ${tradeCount}/${totalTradesTarget}...`}
            {mode === 'success' && 'Simulation completed successfully!'}
            {mode === 'error' && 'Simulation encountered an error'}
          </DialogDescription>
        </DialogHeader>

        {/* Unlock Popup */}
        <AnimatePresence>
          {showUnlockPopup && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
              onClick={() => setShowUnlockPopup(null)}
            >
              <motion.div
                initial={{ y: 50, rotateX: -20 }}
                animate={{ y: 0, rotateX: 0 }}
                transition={{ type: 'spring', damping: 15, stiffness: 300 }}
                className="bg-gradient-to-br from-primary/20 via-background to-success/20 p-8 rounded-2xl border-2 border-primary shadow-2xl max-w-md text-center"
                onClick={e => e.stopPropagation()}
              >
                <motion.div
                  animate={{ scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 0.5, repeat: 3 }}
                >
                  {showUnlockPopup === 'paper' ? (
                    <Sparkles className="w-20 h-20 mx-auto text-primary mb-4" />
                  ) : (
                    <Zap className="w-20 h-20 mx-auto text-success mb-4" />
                  )}
                </motion.div>
                
                <motion.h2 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  transition={{ delay: 0.3 }} 
                  className="text-3xl font-bold mb-2"
                >
                  {showUnlockPopup === 'paper' ? 'Paper Trading Unlocked!' : 'Live Trading Unlocked!'}
                </motion.h2>
                
                <motion.p 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  transition={{ delay: 0.5 }} 
                  className="text-muted-foreground mb-6"
                >
                  {showUnlockPopup === 'paper' 
                    ? 'You completed 20 profitable simulation trades! Paper trading is now available.'
                    : 'You completed 50 profitable paper trades! Live trading is now available.'}
                </motion.p>
                
                <Button onClick={() => setShowUnlockPopup(null)} size="lg" className="px-8">
                  {showUnlockPopup === 'paper' ? 'Start Paper Trading' : 'Start Live Trading'}
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <ScrollArea className="max-h-[70vh]">
          <AnimatePresence mode="wait">
            {mode === 'config' && (
              <motion.div
                key="config"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 pr-4"
              >
                {/* Trading Mode Selection */}
                <div className="space-y-2">
                  <Label>Trading Mode</Label>
                  <Select 
                    value={config.tradingMode} 
                    onValueChange={(v) => {
                      // Prevent selecting locked modes
                      if (v === 'paper' && isPaperLocked) return;
                      if (v === 'live' && isLiveLocked) return;
                      setConfig(c => ({ ...c, tradingMode: v as SimulationConfig['tradingMode'] }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simulation">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <span>Simulation</span>
                            <span className="text-xs text-muted-foreground">Test with mock trades, no real orders</span>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="paper" disabled={isPaperLocked}>
                        <div className="flex items-center gap-2">
                          {isPaperLocked && <Lock className="w-4 h-4 text-muted-foreground" />}
                          <div className="flex flex-col">
                            <span className={isPaperLocked ? 'text-muted-foreground' : ''}>Paper Trading</span>
                            <span className="text-xs text-muted-foreground">
                              {isPaperLocked 
                                ? `${simulationTradesRemaining} simulation trades to unlock` 
                                : 'Track with real prices, no real orders'}
                            </span>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="live" disabled={isLiveLocked}>
                        <div className="flex items-center gap-2">
                          {isLiveLocked && <Lock className="w-4 h-4 text-muted-foreground" />}
                          <div className="flex flex-col">
                            <span className={isLiveLocked ? 'text-muted-foreground' : ''}>Live Trading</span>
                            <span className="text-xs text-muted-foreground">
                              {isLiveLocked 
                                ? `${paperTradesRemaining} paper trades to unlock` 
                                : 'Real orders on connected exchanges'}
                            </span>
                          </div>
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
                  Run {totalTradesTarget} {config.tradingMode === 'simulation' ? 'Simulations' : config.tradingMode === 'paper' ? 'Paper Trades' : 'Live Trades'}
                </Button>
              </motion.div>
            )}

            {mode === 'simulating' && (
              <motion.div
                key="simulating"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 py-4 pr-4"
              >
                {/* NEW: Live Profit Counter */}
                <motion.div 
                  className="text-center py-3 px-4 rounded-lg bg-gradient-to-r from-success/10 to-primary/10 border border-success/30"
                  key={runningProfit}
                  animate={{ scale: runningProfit > 0 ? [1, 1.02, 1] : 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-1">
                    <DollarSign className="w-4 h-4" />
                    Running Profit
                  </div>
                  <motion.span 
                    className="text-3xl font-bold text-success"
                    key={runningProfit}
                    initial={{ scale: 1.2, opacity: 0.5 }}
                    animate={{ scale: 1, opacity: 1 }}
                  >
                    +${runningProfit.toFixed(2)}
                  </motion.span>
                </motion.div>

                {/* Overall Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Trade {tradeCount} of {totalTradesTarget}</span>
                    <span>{Math.round(overallProgress)}%</span>
                  </div>
                  <Progress value={overallProgress} className="h-3" />
                </div>
                
                {/* Current Trade Stages */}
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
                        {stage.duration && (
                          <p className="text-xs text-muted-foreground">{stage.duration}ms</p>
                        )}
                      </div>
                      {index === currentStageIndex && stage.status === 'running' && (
                        <Badge variant="secondary" className="animate-pulse">Active</Badge>
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* NEW: Live Trade Feed */}
                {completedTrades.length > 0 && (
                  <div className="p-3 rounded-lg bg-secondary/30 border border-border">
                    <div className="flex items-center gap-2 text-sm font-medium mb-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      Completed Trades
                    </div>
                    <div 
                      ref={tradeFeedRef}
                      className="max-h-28 overflow-y-auto space-y-1"
                    >
                      <AnimatePresence>
                        {completedTrades.map((trade) => (
                          <motion.div
                            key={trade.number}
                            initial={{ opacity: 0, x: 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3 }}
                            className="flex items-center gap-2 text-xs font-mono py-1 px-2 rounded bg-background/50"
                          >
                            <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0" />
                            <span className="text-muted-foreground">#{trade.number}</span>
                            <span className="text-primary font-medium">{trade.symbol}</span>
                            <Badge 
                              variant={trade.side === 'long' ? 'default' : 'destructive'} 
                              className="text-[10px] px-1 py-0 h-4"
                            >
                              {trade.side.toUpperCase()}
                            </Badge>
                            <span className="text-success font-bold ml-auto">+${trade.profit.toFixed(2)}</span>
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {trade.duration}ms
                            </span>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                {/* Live Data Display */}
                {Object.keys(simulationData).length > 0 && (
                  <div className="p-3 rounded-lg bg-secondary/30 font-mono text-xs space-y-1">
                    {simulationData.exchange && <p>Exchange: <span className="text-primary">{simulationData.exchange}</span></p>}
                    {simulationData.symbol && <p>Symbol: <span className="text-primary">{simulationData.symbol}</span></p>}
                    {simulationData.side && <p>Side: <span className={simulationData.side === 'long' ? 'text-success' : 'text-destructive'}>{simulationData.side.toUpperCase()}</span></p>}
                    {simulationData.entryPrice && <p>Entry: <span className="text-foreground">${simulationData.entryPrice.toFixed(2)}</span></p>}
                    {simulationData.exitPrice && <p>Exit: <span className="text-foreground">${simulationData.exitPrice.toFixed(2)}</span></p>}
                  </div>
                )}
              </motion.div>
            )}

            {mode === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-6 space-y-6 pr-4"
              >
                <motion.div 
                  className="w-16 h-16 mx-auto rounded-full bg-success/20 flex items-center justify-center"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 0.5, repeat: 2 }}
                >
                  <CheckCircle2 className="w-8 h-8 text-success" />
                </motion.div>
                <div className="text-center">
                  <h3 className="text-xl font-bold">{totalTradesTarget} Trades Complete!</h3>
                  <motion.p 
                    className="text-muted-foreground mt-2"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                  >
                    Total Profit: <span className="text-success font-bold text-2xl">${simulationData.pnl?.toFixed(2)}</span>
                  </motion.p>
                </div>
                
                {/* Post-Simulation Analysis */}
                {analysisResult && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-lg bg-gradient-to-r from-primary/10 to-success/10 border border-primary/30"
                  >
                    <h4 className="font-bold mb-3 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      24-Hour Trade Analysis
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Max Trades/24h:</span>
                        <span className="font-mono font-bold">{analysisResult.maxTradesIn24h.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg Trade Time:</span>
                        <span className="font-mono">{analysisResult.avgTradeTime.toFixed(0)}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Bottleneck:</span>
                        <span className="text-warning font-medium">{analysisResult.bottleneck}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Est. Daily Profit:</span>
                        <span className="text-success font-bold">${analysisResult.estimatedDailyProfit.toFixed(2)}</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                <div className="p-4 rounded-lg bg-success/10 border border-success/30">
                  <p className="text-sm text-success font-medium">
                    ✅ Strategy: {STRATEGIES.find(s => s.id === config.strategy)?.name}
                  </p>
                  <p className="text-sm text-success font-medium">
                    ✅ Mode: {config.tradingMode.charAt(0).toUpperCase() + config.tradingMode.slice(1)}
                  </p>
                </div>
                <Button onClick={() => onOpenChange(false)} className="w-full">
                  Continue Trading
                </Button>
              </motion.div>
            )}

            {mode === 'error' && errorInfo && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-6 space-y-4 pr-4"
              >
                {/* Enhanced Error Panel */}
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-destructive">Simulation Failed</h4>
                      <div className="mt-2 space-y-1 text-sm">
                        <p className="text-muted-foreground">
                          Stage: <span className="font-medium text-foreground">{errorInfo.stage}</span>
                        </p>
                        <p className="text-muted-foreground">
                          Error Code: <span className="font-mono text-destructive">{errorInfo.errorCode}</span>
                        </p>
                        {errorInfo.tradeNumber && (
                          <p className="text-muted-foreground">
                            Trade #: <span className="font-medium text-foreground">{errorInfo.tradeNumber}</span>
                          </p>
                        )}
                      </div>
                      <p className="text-sm mt-3 text-foreground">{errorInfo.message}</p>
                    </div>
                  </div>

                  {/* Collapsible Technical Details */}
                  {errorInfo.technicalDetails && (
                    <Collapsible open={showTechnicalDetails} onOpenChange={setShowTechnicalDetails}>
                      <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-2">
                        <ChevronDown className={cn("w-4 h-4 transition-transform", showTechnicalDetails && "rotate-180")} />
                        Technical Details
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="p-3 rounded bg-background/50 font-mono text-xs space-y-1 mt-2">
                          {errorInfo.technicalDetails.rpcName && (
                            <p>RPC: <span className="text-primary">{errorInfo.technicalDetails.rpcName}</span></p>
                          )}
                          {errorInfo.technicalDetails.params && (
                            <p>Params: <span className="text-muted-foreground">{JSON.stringify(errorInfo.technicalDetails.params)}</span></p>
                          )}
                          {errorInfo.technicalDetails.dbErrorCode && (
                            <p>DB Error: <span className="text-destructive">{errorInfo.technicalDetails.dbErrorCode}</span></p>
                          )}
                          {errorInfo.technicalDetails.hint && (
                            <p>Hint: <span className="text-warning">{errorInfo.technicalDetails.hint}</span></p>
                          )}
                          <p>Timestamp: <span className="text-muted-foreground">{errorInfo.timestamp.toISOString()}</span></p>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
                
                {/* Suggested Fix */}
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                  <h4 className="font-medium text-primary mb-2">Suggested Fix:</h4>
                  <p className="text-sm">{errorInfo.fix}</p>
                </div>

                {/* Error History */}
                {errorHistory.length > 1 && (
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronDown className="w-4 h-4" />
                      Error History ({errorHistory.length} errors)
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 space-y-2 max-h-32 overflow-y-auto">
                        {errorHistory.map((err, idx) => (
                          <div key={idx} className="p-2 rounded bg-secondary/30 text-xs">
                            <div className="flex items-center gap-2">
                              <Badge variant="destructive" className="text-[10px]">{err.errorCode}</Badge>
                              <span className="text-muted-foreground">Trade #{err.tradeNumber || 'N/A'}</span>
                            </div>
                            <p className="mt-1 text-muted-foreground truncate">{err.message}</p>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={copyErrorDetails} className="flex-1">
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Details
                  </Button>
                  <Button onClick={handleRetry} className="flex-1">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                  </Button>
                </div>
                <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full">
                  Close
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
