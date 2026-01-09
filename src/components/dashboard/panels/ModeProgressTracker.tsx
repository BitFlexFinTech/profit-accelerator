import { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/store/useAppStore';
import { Beaker, FileText, Zap, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function ModeProgressTracker() {
  // Subscribe to SSOT store - single source of truth
  const { 
    paperModeUnlocked, 
    liveModeUnlocked, 
    successfulPaperTrades,
    simulationCompleted,
    isLoading,
    syncFromDatabase
  } = useAppStore();

  // Trigger a sync on mount to ensure fresh data
  useEffect(() => {
    syncFromDatabase();
  }, [syncFromDatabase]);

  // Don't render anything while loading to prevent flash of wrong content
  if (isLoading) return null;

  // Hide completely if live mode is unlocked (user has passed both gates)
  if (liveModeUnlocked) return null;

  // Determine which card to show based on SSOT state
  const showSimulationCard = !paperModeUnlocked;
  const showPaperCard = paperModeUnlocked && !liveModeUnlocked;

  // Calculate simulation trades from simulationCompleted flag
  // If simulation is completed, show 20/20, otherwise show progress
  const simulationTrades = simulationCompleted ? 20 : 0;
  const simulationProgress = (simulationTrades / 20) * 100;
  const paperProgress = (successfulPaperTrades / 20) * 100;

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
                    {simulationTrades}/20 trades
                  </Badge>
                </div>
                <Progress 
                  value={simulationProgress} 
                  className="h-2 mb-2" 
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {20 - simulationTrades} more to unlock Paper Mode
                  </span>
                  <span className="text-primary">
                    Use Simulate button to practice
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
                    {successfulPaperTrades}/20 trades
                  </Badge>
                </div>
                <Progress 
                  value={paperProgress} 
                  className="h-2 mb-2" 
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    {20 - successfulPaperTrades} more to unlock Live Trading
                  </span>
                  <span className="text-success">
                    Start bot in Paper mode to progress
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
