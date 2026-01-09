import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Beaker, FileText, Zap, Trophy, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ProgressData {
  simulationTrades: number;
  paperTrades: number;
  paperUnlocked: boolean;
  liveUnlocked: boolean;
  simulationProfit: number;
  paperProfit: number;
}

export function ModeProgressTracker() {
  const [progress, setProgress] = useState<ProgressData>({
    simulationTrades: 0,
    paperTrades: 0,
    paperUnlocked: false,
    liveUnlocked: false,
    simulationProfit: 0,
    paperProfit: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchProgress = async () => {
    const { data } = await supabase
      .from('simulation_progress')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    if (data) {
      setProgress({
        simulationTrades: data.successful_simulation_trades || 0,
        paperTrades: data.successful_paper_trades || 0,
        paperUnlocked: data.paper_mode_unlocked || false,
        liveUnlocked: data.live_mode_unlocked || false,
        simulationProfit: data.simulation_profit_total || 0,
        paperProfit: data.paper_profit_total || 0,
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProgress();

    const channel = supabase
      .channel('progress-tracker')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'simulation_progress'
      }, () => {
        fetchProgress();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) return null;

  // Hide completely if live mode is unlocked (user has passed both gates)
  if (progress.liveUnlocked) return null;

  const showSimulationCard = !progress.paperUnlocked;
  const showPaperCard = progress.paperUnlocked && !progress.liveUnlocked;

  return (
    <div className="flex gap-2">
      <AnimatePresence mode="wait">
        {showSimulationCard && (
          <motion.div
            key="simulation-progress"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -20 }}
            className="flex-1"
          >
            <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-full bg-primary/20">
                      <Beaker className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm font-medium">Simulation Progress</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {progress.simulationTrades}/20 trades
                  </Badge>
                </div>
                <Progress 
                  value={(progress.simulationTrades / 20) * 100} 
                  className="h-2 mb-2" 
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {20 - progress.simulationTrades} more to unlock Paper Mode
                  </span>
                  <span className="text-success">
                    +${progress.simulationProfit.toFixed(2)} profit
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {showPaperCard && (
          <motion.div
            key="paper-progress"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -20 }}
            className="flex-1"
          >
            <Card className="border-success/30 bg-gradient-to-r from-success/5 to-transparent">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-full bg-success/20">
                      <FileText className="w-4 h-4 text-success" />
                    </div>
                    <span className="text-sm font-medium">Paper Trading Progress</span>
                    <Badge className="bg-success/20 text-success text-xs border-0">
                      <Sparkles className="w-3 h-3 mr-1" />
                      Unlocked!
                    </Badge>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {progress.paperTrades}/50 trades
                  </Badge>
                </div>
                <Progress 
                  value={(progress.paperTrades / 50) * 100} 
                  className="h-2 mb-2" 
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    {50 - progress.paperTrades} more to unlock Live Trading
                  </span>
                  <span className="text-success">
                    +${progress.paperProfit.toFixed(2)} profit
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
