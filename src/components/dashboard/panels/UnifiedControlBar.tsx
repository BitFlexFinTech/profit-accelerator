import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { 
  Play, Square, RefreshCw, Bell, Zap, Pause, Activity, AlertTriangle, RotateCcw, FlaskConical
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TradeSimulationModal } from '@/components/dashboard/TradeSimulationModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type BotStatus = 'running' | 'stopped' | 'idle' | 'error';
type StartupStage = 'connecting' | 'fetching' | 'opening' | 'active';

export function UnifiedControlBar() {
  // Default to 'stopped' - NEVER assume bot is running
  const [botStatus, setBotStatus] = useState<BotStatus>('stopped');
  const [isPaperMode, setIsPaperMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showLiveConfirm, setShowLiveConfirm] = useState(false);
  
  // Startup progress bar state
  const [isStartingUp, setIsStartingUp] = useState(false);
  const [startupStage, setStartupStage] = useState<StartupStage>('connecting');
  const [startupProgress, setStartupProgress] = useState(0);
  
  // Simulation modal
  const [showSimulation, setShowSimulation] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);

  // Fetch bot status from database - NEVER auto-start
  const fetchBotStatus = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('trading_config')
        .select('bot_status, trading_mode')
        .limit(1)
        .single();
      
      if (data) {
        // Always respect the database status - never assume running
        const dbStatus = (data.bot_status as BotStatus) || 'stopped';
        setBotStatus(dbStatus);
        setIsPaperMode(data.trading_mode === 'paper');
      } else {
        // No config = bot is definitely stopped
        setBotStatus('stopped');
      }

      // Get active deployment for bot control
      // CRITICAL FIX: Query for both 'active' AND 'running' status
      const { data: deployment } = await supabase
        .from('hft_deployments')
        .select('id, server_id')
        .in('status', ['active', 'running'])
        .limit(1)
        .single();
      
      if (deployment) {
        setDeploymentId(deployment.id || deployment.server_id);
      }
    } catch {
      // Error or no config = bot is stopped
      setBotStatus('stopped');
    }
  }, []);

  useEffect(() => {
    fetchBotStatus();
    const interval = setInterval(fetchBotStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchBotStatus]);

  // Handle startup progress animation
  const startBotWithProgress = async () => {
    setIsStartingUp(true);
    setStartupProgress(0);
    setStartupStage('connecting');
    
    try {
      // Stage 1: Connecting
      setStartupProgress(10);
      const { error } = await supabase.functions.invoke('bot-control', {
        body: { action: 'start', deploymentId }
      });
      if (error) throw error;
      
      setStartupProgress(30);
      setStartupStage('fetching');
      
      // Update DB status
      const { data: config } = await supabase.from('trading_config').select('id').limit(1).single();
      if (config) {
        await supabase.from('trading_config').update({ bot_status: 'running' }).eq('id', config.id);
      }
      
      setStartupProgress(60);
      setStartupStage('opening');
      
      // Subscribe to first trade
      const channel = supabase.channel('first-trade-watch')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trading_journal' }, () => {
          setStartupProgress(100);
          setStartupStage('active');
          setIsStartingUp(false);
          toast.success('First trade executed!');
          supabase.removeChannel(channel);
        })
        .subscribe();
      
      // Timeout after 60 seconds
      setTimeout(() => {
        if (isStartingUp) {
          setStartupProgress(100);
          setStartupStage('active');
          setIsStartingUp(false);
          supabase.removeChannel(channel);
        }
      }, 60000);
      
      setBotStatus('running');
      toast.success('Bot started - waiting for first trade...');
    } catch (err) {
      console.error('Failed to start bot:', err);
      toast.error('Failed to start bot');
      setIsStartingUp(false);
    } finally {
      setIsLoading(false);
      setShowStartConfirm(false);
    }
  };

  const handleStartBot = async () => {
    // Confirm before starting in live mode
    if (!isPaperMode && !showStartConfirm) {
      setShowStartConfirm(true);
      return;
    }
    
    setIsLoading(true);
    await startBotWithProgress();
  };

  const handleStopBot = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('bot-control', {
        body: { action: 'stop', deploymentId }
      });
      if (error) throw error;
      
      const { data: config } = await supabase.from('trading_config').select('id').limit(1).single();
      if (config) {
        await supabase.from('trading_config').update({ bot_status: 'stopped' }).eq('id', config.id);
      }
      
      setBotStatus('stopped');
      toast.success('Bot stopped');
    } catch (err) {
      console.error('Failed to stop bot:', err);
      toast.error('Failed to stop bot');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestartBot = async () => {
    setIsLoading(true);
    try {
      await supabase.functions.invoke('bot-control', { body: { action: 'stop', deploymentId } });
      await new Promise(r => setTimeout(r, 1000));
      await supabase.functions.invoke('bot-control', { body: { action: 'start', deploymentId } });
      setBotStatus('running');
      toast.success('Bot restarted');
    } catch (err) {
      console.error('Failed to restart bot:', err);
      toast.error('Failed to restart bot');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncBalances = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('poll-balances');
      if (error) throw error;
      toast.success('Balances synced');
    } catch (err) {
      console.error('Sync failed:', err);
      toast.error('Sync failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestTelegram = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('telegram-bot', {
        body: { 
          action: 'send-message',
          message: '🤖 <b>Your Bot is running.</b>\n\n✅ Connection test successful!'
        }
      });
      if (error) throw error;
      toast.success('Test message sent to Telegram');
    } catch (err) {
      console.error('Telegram test failed:', err);
      toast.error('Failed to send Telegram message');
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeToggle = async (checked: boolean) => {
    if (!checked && isPaperMode) {
      // Switching to live mode - check paper trade gate
      const { data: simProgress } = await supabase
        .from('simulation_progress')
        .select('live_mode_unlocked, successful_paper_trades')
        .limit(1)
        .single();
      
      if (!simProgress?.live_mode_unlocked) {
        const remaining = 20 - (simProgress?.successful_paper_trades || 0);
        toast.error(`Complete ${remaining} more paper trades to unlock live mode`);
        return;
      }
      
      setShowLiveConfirm(true);
      return;
    }
    await updateTradingMode(checked ? 'paper' : 'live');
  };

  const updateTradingMode = async (mode: 'paper' | 'live') => {
    try {
      const { data: config } = await supabase.from('trading_config').select('id').limit(1).single();
      if (config) {
        await supabase.from('trading_config').update({ trading_mode: mode }).eq('id', config.id);
      }
      setIsPaperMode(mode === 'paper');
      toast.success(`Switched to ${mode.toUpperCase()} mode`);
      setShowLiveConfirm(false);
    } catch (err) {
      console.error('Failed to update mode:', err);
      toast.error('Failed to switch mode');
    }
  };

  const statusColor = {
    running: 'bg-success',
    stopped: 'bg-destructive',
    idle: 'bg-warning',
    error: 'bg-destructive'
  };

  return (
    <>
      <Card className="p-2 bg-card/50 border-border/50">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Bot Status Section */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${statusColor[botStatus]} animate-pulse`} />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Bot
              </span>
              <Badge 
                variant={botStatus === 'running' ? 'default' : 'secondary'}
                className="text-[10px] px-1.5 py-0"
              >
                {botStatus}
              </Badge>
            </div>

            {/* Paper/Live Toggle */}
            <div className="flex items-center gap-2 pl-3 border-l border-border/50">
              <span className={`text-[10px] font-medium ${!isPaperMode ? 'text-destructive' : 'text-muted-foreground'}`}>
                LIVE
              </span>
              <Switch
                checked={isPaperMode}
                onCheckedChange={handleModeToggle}
                className="scale-75 data-[state=checked]:bg-success"
              />
              <span className={`text-[10px] font-medium ${isPaperMode ? 'text-success' : 'text-muted-foreground'}`}>
                PAPER
              </span>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center gap-1.5">
            {botStatus === 'running' ? (
              <Button 
                size="sm" 
                variant="destructive" 
                onClick={handleStopBot}
                disabled={isLoading}
                className="h-7 text-xs px-2"
              >
                <Square className="w-3 h-3 mr-1" />
                Stop
              </Button>
            ) : (
              <Button 
                size="sm" 
                onClick={handleStartBot}
                disabled={isLoading}
                className="h-7 text-xs px-2 bg-success hover:bg-success/90"
              >
                <Play className="w-3 h-3 mr-1" />
                Start
              </Button>
            )}

            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleRestartBot}
              disabled={isLoading || botStatus !== 'running'}
              className="h-7 text-xs px-2"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>

            <div className="h-4 w-px bg-border/50" />

            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleSyncBalances}
              disabled={isLoading}
              className="h-7 text-xs px-2"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Sync
            </Button>

            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleTestTelegram}
              disabled={isLoading}
              className="h-7 text-xs px-2"
            >
              <Bell className="w-3 h-3 mr-1" />
              Test
            </Button>

            <div className="h-4 w-px bg-border/50" />

            {/* Simulate Button */}
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setShowSimulation(true)}
              className="h-7 text-xs px-2 border-primary/50 text-primary hover:bg-primary/10"
            >
              <FlaskConical className="w-3 h-3 mr-1" />
              Simulate
            </Button>

            <Activity className={`w-4 h-4 ml-2 ${botStatus === 'running' ? 'text-success' : 'text-muted-foreground'}`} />
          </div>
        </div>

        {/* Startup Progress Bar */}
        {isStartingUp && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {startupStage === 'connecting' && '🔗 Connecting to VPS...'}
                {startupStage === 'fetching' && '🤖 Fetching AI signals...'}
                {startupStage === 'opening' && '📈 Opening first position...'}
                {startupStage === 'active' && '✅ Trading active!'}
              </span>
              <span className="text-muted-foreground">{startupProgress}%</span>
            </div>
            <Progress value={startupProgress} className="h-1.5" />
          </div>
        )}
      </Card>

      {/* Live Mode Confirmation */}
      <AlertDialog open={showLiveConfirm} onOpenChange={setShowLiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Switch to LIVE Trading?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will enable real trading with actual funds. Make sure your API keys have the correct permissions and risk limits are set.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => updateTradingMode('live')}
              className="bg-destructive hover:bg-destructive/90"
            >
              Enable LIVE Mode
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Start Bot Confirmation (Live Mode) */}
      <AlertDialog open={showStartConfirm} onOpenChange={setShowStartConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Start Bot in LIVE Mode?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to start the trading bot in LIVE mode. This will execute real trades with your funds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStartBot}
              className="bg-success hover:bg-success/90"
            >
              Start Bot
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Trade Simulation Modal */}
      <TradeSimulationModal open={showSimulation} onOpenChange={setShowSimulation} />
    </>
  );
}