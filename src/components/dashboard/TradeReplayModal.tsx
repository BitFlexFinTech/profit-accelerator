import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Play, Pause, RotateCcw, Brain, TrendingUp, ArrowRightLeft, 
  Target, CheckCircle2, Clock, DollarSign, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';

interface TradeData {
  id: string;
  symbol: string;
  exchange: string;
  side: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  aiReasoning?: string;
  createdAt: string;
  closedAt?: string;
  executionLatencyMs?: number;
}

interface TradeReplayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trade: TradeData | null;
}

interface ReplayStage {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  duration: number;
}

const REPLAY_STAGES: ReplayStage[] = [
  { id: 'ai-signal', name: 'AI Signal Detected', icon: <Brain className="w-5 h-5" />, description: 'AI identified trading opportunity', duration: 1500 },
  { id: 'price-check', name: 'Price Verification', icon: <TrendingUp className="w-5 h-5" />, description: 'Confirmed optimal entry point', duration: 800 },
  { id: 'order-placed', name: 'Order Placed', icon: <ArrowRightLeft className="w-5 h-5" />, description: 'Market order executed', duration: 500 },
  { id: 'position-open', name: 'Position Open', icon: <Zap className="w-5 h-5" />, description: 'Trade active, monitoring...', duration: 2000 },
  { id: 'target-hit', name: 'Target Reached', icon: <Target className="w-5 h-5" />, description: 'Profit target achieved', duration: 600 },
  { id: 'closed', name: 'Trade Closed', icon: <CheckCircle2 className="w-5 h-5" />, description: 'Position closed successfully', duration: 400 },
];

export function TradeReplayModal({ open, onOpenChange, trade }: TradeReplayModalProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStage, setCurrentStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showPriceAnimation, setShowPriceAnimation] = useState(false);
  const [animatedPrice, setAnimatedPrice] = useState(0);

  useEffect(() => {
    if (!open || !trade) {
      setCurrentStage(0);
      setProgress(0);
      setIsPlaying(false);
      return;
    }
    setAnimatedPrice(trade.entryPrice);
  }, [open, trade]);

  useEffect(() => {
    if (!isPlaying || !trade) return;

    const stage = REPLAY_STAGES[currentStage];
    if (!stage) {
      setIsPlaying(false);
      return;
    }

    // Animate progress within current stage
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) return 100;
        return prev + 5;
      });
    }, stage.duration / 20);

    // Price animation for position open stage
    if (currentStage === 3 && trade) {
      setShowPriceAnimation(true);
      const priceRange = trade.exitPrice - trade.entryPrice;
      const priceSteps = 20;
      let step = 0;
      
      const priceInterval = setInterval(() => {
        step++;
        const newPrice = trade.entryPrice + (priceRange * step / priceSteps);
        setAnimatedPrice(newPrice);
        if (step >= priceSteps) clearInterval(priceInterval);
      }, stage.duration / priceSteps);
    }

    // Move to next stage
    const stageTimer = setTimeout(() => {
      setProgress(0);
      if (currentStage < REPLAY_STAGES.length - 1) {
        setCurrentStage(prev => prev + 1);
      } else {
        setIsPlaying(false);
        setShowPriceAnimation(false);
      }
    }, stage.duration);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(stageTimer);
    };
  }, [isPlaying, currentStage, trade]);

  const handlePlayPause = () => {
    if (currentStage >= REPLAY_STAGES.length - 1 && !isPlaying) {
      // Restart
      setCurrentStage(0);
      setProgress(0);
      setAnimatedPrice(trade?.entryPrice || 0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleRestart = () => {
    setCurrentStage(0);
    setProgress(0);
    setIsPlaying(false);
    setAnimatedPrice(trade?.entryPrice || 0);
    setShowPriceAnimation(false);
  };

  if (!trade) return null;

  const isProfitable = trade.pnl > 0;
  const totalDuration = REPLAY_STAGES.reduce((sum, s) => sum + s.duration, 0);
  const elapsedDuration = REPLAY_STAGES.slice(0, currentStage).reduce((sum, s) => sum + s.duration, 0) + 
    (progress / 100) * (REPLAY_STAGES[currentStage]?.duration || 0);
  const overallProgress = (elapsedDuration / totalDuration) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Play className="w-5 h-5 text-primary" />
            Trade Replay
            <Badge variant={isProfitable ? 'default' : 'destructive'} className="ml-2">
              {isProfitable ? '+' : ''}{trade.pnl.toFixed(2)} USDT
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Trade Info Header */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
            <div className="flex items-center gap-4">
              <div>
                <p className="font-bold text-lg">{trade.symbol}</p>
                <p className="text-sm text-muted-foreground">{trade.exchange}</p>
              </div>
              <Badge variant={trade.side === 'buy' ? 'default' : 'secondary'}>
                {trade.side.toUpperCase()}
              </Badge>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Quantity</p>
              <p className="font-mono">{trade.quantity.toFixed(6)}</p>
            </div>
          </div>

          {/* Live Price Display */}
          <div className="relative p-6 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/20 border border-primary/20">
            <div className="absolute top-2 right-2">
              <Badge variant="outline" className="text-xs">
                <Clock className="w-3 h-3 mr-1" />
                {(trade.executionLatencyMs || 0).toFixed(0)}ms
              </Badge>
            </div>
            
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">
                {showPriceAnimation ? 'Current Price' : 'Entry Price'}
              </p>
              <motion.p 
                key={animatedPrice}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                className="text-4xl font-bold font-mono"
              >
                ${animatedPrice.toFixed(2)}
              </motion.p>
              
              {showPriceAnimation && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-2 flex items-center justify-center gap-1 ${isProfitable ? 'text-success' : 'text-destructive'}`}
                >
                  <DollarSign className="w-4 h-4" />
                  <span className="font-mono">
                    {isProfitable ? '+' : ''}{(animatedPrice - trade.entryPrice).toFixed(2)}
                  </span>
                </motion.div>
              )}
            </div>
          </div>

          {/* Stage Timeline */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>Replay Progress</span>
              <span>{Math.round(overallProgress)}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
            
            <div className="space-y-2 mt-4">
              {REPLAY_STAGES.map((stage, index) => {
                const isActive = index === currentStage;
                const isComplete = index < currentStage;
                const isPending = index > currentStage;
                
                return (
                  <motion.div
                    key={stage.id}
                    initial={false}
                    animate={{
                      opacity: isPending ? 0.4 : 1,
                      scale: isActive ? 1.02 : 1,
                    }}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      isActive ? 'bg-primary/20 border border-primary/40' :
                      isComplete ? 'bg-success/10' : 'bg-secondary/20'
                    }`}
                  >
                    <div className={`${isComplete ? 'text-success' : isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                      {stage.icon}
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium text-sm ${isActive ? 'text-primary' : ''}`}>
                        {stage.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{stage.description}</p>
                    </div>
                    {isActive && (
                      <div className="w-16">
                        <Progress value={progress} className="h-1" />
                      </div>
                    )}
                    {isComplete && (
                      <CheckCircle2 className="w-4 h-4 text-success" />
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* AI Reasoning */}
          {trade.aiReasoning && (
            <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/30">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium">AI Reasoning</span>
              </div>
              <p className="text-sm text-muted-foreground">{trade.aiReasoning}</p>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="icon" onClick={handleRestart}>
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button size="lg" onClick={handlePlayPause} className="px-8">
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Pause
                </>
              ) : currentStage >= REPLAY_STAGES.length - 1 ? (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Replay
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Play
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
