import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { 
  Play, Square, RefreshCw, Bell, Zap, Pause, Activity, AlertTriangle, RotateCcw, FlaskConical, FileText
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TradeSimulationModal } from '@/components/dashboard/TradeSimulationModal';
import { useAppStore } from '@/store/useAppStore';
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

type BotStatus = 'running' | 'stopped' | 'idle' | 'error' | 'starting';
type StartupStage = 'idle' | 'connecting' | 'verifying' | 'waiting_trade' | 'active' | 'timeout';

export function UnifiedControlBar() {
  // Get state from SSOT store
  const { 
    activeVPS, 
    liveModeUnlocked, 
    syncFromDatabase 
  } = useAppStore();

  // Local state
  const [botStatus, setBotStatus] = useState<BotStatus>('stopped');
  const [isPaperMode, setIsPaperMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showLiveConfirm, setShowLiveConfirm] = useState(false);
  
  // Startup progress state with ref to prevent stale closure issues
  const [startupStage, setStartupStage] = useState<StartupStage>('idle');
  const [startupProgress, setStartupProgress] = useState(0);
  const startupStageRef = useRef<StartupStage>('idle');
  const startTimeRef = useRef<number | null>(null);
  
  // Simulation modal
  const [showSimulation, setShowSimulation] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);

  // Sync startupStage with ref
  useEffect(() => {
    startupStageRef.current = startupStage;
  }, [startupStage]);

  // Listen for custom event from Leaderboard to open simulation modal
  useEffect(() => {
    const handleOpenSimulation = () => setShowSimulation(true);
    window.addEventListener('open-simulation-modal', handleOpenSimulation);
    return () => window.removeEventListener('open-simulation-modal', handleOpenSimulation);
  }, []);

  // Fetch bot status from database
  const fetchBotStatus = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('trading_config')
        .select('bot_status, trading_mode')
        .limit(1)
        .single();
      
      if (data) {
        const dbStatus = (data.bot_status as BotStatus) || 'stopped';
        // Only update if not in startup sequence
        if (startupStageRef.current === 'idle' || startupStageRef.current === 'active') {
          setBotStatus(dbStatus);
        }
        setIsPaperMode(data.trading_mode === 'paper');
      } else {
        setBotStatus('stopped');
      }

      // Get active deployment for bot control
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
      if (startupStageRef.current === 'idle') {
        setBotStatus('stopped');
      }
    }
  }, []);

  useEffect(() => {
    fetchBotStatus();
    const interval = setInterval(fetchBotStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchBotStatus]);

  // Subscribe to first trade for startup completion
  const subscribeToFirstTrade = useCallback(() => {
    const channel = supabase.channel('first-trade-watch-' + Date.now())
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'trading_journal' 
      }, (payload) => {
        console.log('[UnifiedControlBar] First trade detected:', payload);
        setStartupProgress(100);
        setStartupStage('active');
        setBotStatus('running');
        toast.success('First trade executed!');
        syncFromDatabase();
        supabase.removeChannel(channel);
      })
      .subscribe();

    return channel;
  }, [syncFromDatabase]);

  // Handle startup progress with deterministic stages
  const startBotWithProgress = async () => {
    setStartupStage('connecting');
    setStartupProgress(10);
    startTimeRef.current = Date.now();
    
    try {
      // Stage 1: Connecting - invoke bot-control
      console.log('[UnifiedControlBar] Starting bot, deploymentId:', deploymentId);
      const { data, error } = await supabase.functions.invoke('bot-control', {
        body: { action: 'start', deploymentId }
      });
      
      if (error || !data?.success) {
        const errMsg = error?.message || data?.error || 'Unknown error';
        console.error('[UnifiedControlBar] Bot start failed:', errMsg);
        toast.error(`Failed to start bot: ${errMsg}`);
        setStartupStage('idle');
        setStartupProgress(0);
        setBotStatus('error');
        return;
      }
      
      console.log('[UnifiedControlBar] Bot control response:', data);
      setStartupProgress(40);
      setStartupStage('verifying');
      
      // Stage 2: Verifying - bot-control already verified health
      if (data.healthVerified) {
        console.log('[UnifiedControlBar] Health verified by bot-control');
        setStartupProgress(60);
      } else {
        console.log('[UnifiedControlBar] Health not verified, container may still be starting');
        setStartupProgress(50);
      }
      
      setStartupStage('waiting_trade');
      setBotStatus('running');
      
      // Subscribe to first trade
      const channel = subscribeToFirstTrade();
      
      // VPS bot now handles all trading - no smoke test needed
      // Bot will start filling positions automatically based on AI signals
      setStartupProgress(80);
      console.log('[UnifiedControlBar] VPS bot is now active and will fill positions from AI signals');
      
      // Timeout after 60 seconds - transition to active regardless
      setTimeout(() => {
        if (startupStageRef.current === 'waiting_trade' || startupStageRef.current === 'verifying') {
          console.log('[UnifiedControlBar] Timeout reached, transitioning to active');
          setStartupProgress(100);
          setStartupStage('active');
          setBotStatus('running');
          toast.info('Bot is running. Waiting for trade signals...');
          supabase.removeChannel(channel);
        }
      }, 60000);
      
      toast.success('Bot started - waiting for first trade...');
      
    } catch (err) {
      console.error('[UnifiedControlBar] Failed to start bot:', err);
      toast.error('Failed to start bot');
      setStartupStage('idle');
      setStartupProgress(0);
      setBotStatus('error');
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
    
    if (!deploymentId) {
      toast.error('No VPS deployment found. Deploy a VPS first.');
      return;
    }
    
    setIsLoading(true);
    await startBotWithProgress();
  };

  const handleStopBot = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('bot-control', {
        body: { action: 'stop', deploymentId }
      });
      
      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || 'Stop failed');
      }
      
      setBotStatus('stopped');
      setStartupStage('idle');
      setStartupProgress(0);
      toast.success('Bot stopped');
      syncFromDatabase();
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
      const { data, error } = await supabase.functions.invoke('bot-control', { 
        body: { action: 'restart', deploymentId } 
      });
      
      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || 'Restart failed');
      }
      
      setBotStatus('running');
      toast.success('Bot restarted');
      syncFromDatabase();
    } catch (err) {
      console.error('Failed to restart bot:', err);
      toast.error('Failed to restart bot');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('bot-control', {
        body: { action: 'logs', deploymentId }
      });
      
      if (error) throw error;
      
      console.log('[Bot Logs]', data?.logs);
      toast.info('Logs printed to console (F12)');
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      toast.error('Failed to fetch logs');
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
      syncFromDatabase();
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
      // Switching to live mode - check if unlocked
      if (!liveModeUnlocked) {
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

  const isStartingUp = startupStage !== 'idle' && startupStage !== 'active';

  const statusColor = {
    running: 'bg-success',
    stopped: 'bg-destructive',
    idle: 'bg-warning',
    error: 'bg-destructive',
    starting: 'bg-warning'
  };

  const getStartupMessage = () => {
    switch (startupStage) {
      case 'connecting': return '🔗 Connecting to VPS...';
      case 'verifying': return '🤖 Verifying bot health...';
      case 'waiting_trade': return '📈 Bot running, waiting for trade signals...';
      case 'active': return '✅ Trading active!';
      default: return '';
    }
  };

  return (
    <>
      <Card className="p-2 bg-card/50 border-border/50">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Bot Status Section */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${statusColor[botStatus]} ${botStatus === 'running' || botStatus === 'starting' ? 'animate-pulse' : ''}`} />
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
            {botStatus === 'running' || botStatus === 'starting' ? (
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
                disabled={isLoading || !deploymentId}
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

            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleViewLogs}
              disabled={isLoading || !deploymentId}
              className="h-7 text-xs px-2"
              title="View bot logs (prints to console)"
            >
              <FileText className="w-3 h-3" />
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
                {getStartupMessage()}
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
