import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Play, Square, RefreshCw, Bell, Activity, RotateCcw, FileText, Server, Zap, AlertTriangle, XCircle, Wifi
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { checkVpsApiHealth, pingVpsExchanges } from '@/services/vpsApiService';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { useVPSHealthPolling } from '@/hooks/useVPSHealthPolling';
import { cn } from '@/lib/utils';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type BotStatus = 'running' | 'stopped' | 'standby' | 'idle' | 'error' | 'starting';
type StartupStage = 'idle' | 'connecting' | 'verifying' | 'waiting_trade' | 'active' | 'timeout';

export function UnifiedControlBar() {
  // Get state from SSOT store
  const { activeVPS, syncFromDatabase } = useAppStore();

  // VPS Health Polling - provides real-time VPS status + trading latency
  const { health: vpsHealth, isPolling: vpsPolling, refresh: refreshVpsHealth, forceSync } = useVPSHealthPolling({
    pollIntervalMs: 30000,
    enabled: true,
  });

  // Local state
  const [botStatus, setBotStatus] = useState<BotStatus>('stopped');
  const [isLoading, setIsLoading] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  
  // Startup progress state with ref to prevent stale closure issues
  const [startupStage, setStartupStage] = useState<StartupStage>('idle');
  const [startupProgress, setStartupProgress] = useState(0);
  const startupStageRef = useRef<StartupStage>('idle');
  const startTimeRef = useRef<number | null>(null);
  
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  
  // VPS API status
  const [vpsApiStatus, setVpsApiStatus] = useState<{ ok: boolean; latencyMs: number | null }>({ ok: false, latencyMs: null });
  const [isTestingApi, setIsTestingApi] = useState(false);

  // Sync startupStage with ref
  useEffect(() => {
    startupStageRef.current = startupStage;
  }, [startupStage]);

  // Fetch bot status from database
  const fetchBotStatus = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('trading_config')
        .select('bot_status')
        .limit(1)
        .single();
      
      if (data) {
        const dbStatus = (data.bot_status as BotStatus) || 'stopped';
        // Only update if not in startup sequence
        if (startupStageRef.current === 'idle' || startupStageRef.current === 'active') {
          setBotStatus(dbStatus);
        }
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

  // Check VPS API health on mount and periodically
  useEffect(() => {
    const checkApi = async () => {
      if (vpsHealth.ipAddress) {
        const result = await checkVpsApiHealth(vpsHealth.ipAddress);
        setVpsApiStatus({ ok: result.ok, latencyMs: result.responseMs });
      }
    };
    checkApi();
    const interval = setInterval(checkApi, 30000);
    return () => clearInterval(interval);
  }, [vpsHealth.ipAddress]);

  // Clear error state handler
  const handleClearError = async () => {
    setIsLoading(true);
    try {
      // Update trading_config
      await supabase
        .from('trading_config')
        .update({ bot_status: 'stopped', updated_at: new Date().toISOString() })
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      // Update hft_deployments
      await supabase
        .from('hft_deployments')
        .update({ bot_status: 'stopped', updated_at: new Date().toISOString() })
        .eq('bot_status', 'error');
      
      setBotStatus('stopped');
      setStartupStage('idle');
      setStartupProgress(0);
      toast.success('Error cleared - bot status reset to stopped');
      refreshVpsHealth();
      syncFromDatabase();
    } catch (err) {
      console.error('Failed to clear error:', err);
      toast.error('Failed to clear error state');
    } finally {
      setIsLoading(false);
    }
  };

  // Test VPS API handler
  const handleTestVpsApi = async () => {
    if (!vpsHealth.ipAddress) {
      toast.error('No VPS IP available');
      return;
    }
    setIsTestingApi(true);
    try {
      const healthResult = await checkVpsApiHealth(vpsHealth.ipAddress);
      setVpsApiStatus({ ok: healthResult.ok, latencyMs: healthResult.responseMs });
      
      if (healthResult.ok) {
        const pingResult = await pingVpsExchanges(vpsHealth.ipAddress);
        if (pingResult.success && pingResult.pings.length > 0) {
          const summary = pingResult.pings
            .map((r) => `${r.exchange}: ${r.latencyMs}ms`)
            .join(', ');
          toast.success(`VPS API OK (${healthResult.responseMs}ms) | ${summary}`);
        } else {
          toast.success(`VPS API OK (${healthResult.responseMs}ms)`);
        }
      } else {
        toast.error(`VPS API failed: ${healthResult.error || 'Unknown error'}`);
      }
    } catch (err) {
      toast.error('VPS API test failed');
    } finally {
      setIsTestingApi(false);
    }
  };

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
      console.log('[UnifiedControlBar] Starting bot in LIVE mode, deploymentId:', deploymentId);
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
      
      // VPS bot now handles all trading
      setStartupProgress(80);
      console.log('[UnifiedControlBar] VPS bot is now active in LIVE mode');
      
      // Timeout after 60 seconds - transition to active regardless
      setTimeout(() => {
        if (startupStageRef.current === 'waiting_trade' || startupStageRef.current === 'verifying') {
          console.log('[UnifiedControlBar] Timeout reached, transitioning to active');
          setStartupProgress(100);
          setStartupStage('active');
          setBotStatus('running');
          toast.info('Bot is running in LIVE mode. Waiting for trade signals...');
          supabase.removeChannel(channel);
        }
      }, 60000);
      
      toast.success('Bot started in LIVE mode - waiting for first trade...');
      
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
    // Always confirm before starting (LIVE mode)
    if (!showStartConfirm) {
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
          message: '🤖 <b>Your Bot is running in LIVE mode.</b>\n\n✅ Connection test successful!'
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

  const isStartingUp = startupStage !== 'idle' && startupStage !== 'active';

  const statusColor = {
    running: 'bg-success',
    stopped: 'bg-destructive',
    standby: 'bg-muted-foreground', // Docker up but not trading
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
    <TooltipProvider delayDuration={200}>
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

            {/* Live Mode Indicator */}
            <div className="flex items-center gap-2 pl-3 border-l border-border/50">
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                LIVE
              </Badge>
            </div>

            {/* VPS Status Indicator - NEW */}
            <div className="flex items-center gap-2 pl-3 border-l border-border/50">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-help">
                    <Server className={cn(
                      "w-3 h-3",
                      vpsHealth.status === 'healthy' ? 'text-success' : 
                      vpsHealth.status === 'unreachable' ? 'text-destructive' : 'text-muted-foreground'
                    )} />
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {vpsHealth.ipAddress || 'No VPS'}
                    </span>
                    {vpsHealth.status === 'healthy' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <div className="text-xs space-y-1">
                    <p>VPS: {vpsHealth.provider || 'Unknown'} ({vpsHealth.region || 'N/A'})</p>
                    <p>Status: {vpsHealth.status}</p>
                    <p>Bot: {vpsHealth.botStatus || 'N/A'}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Trading Latency - NEW (HFT-relevant!) */}
            {vpsHealth.tradingLatencyMs !== null && (
              <div className="flex items-center gap-2 pl-3 border-l border-border/50">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-help">
                      <Zap className={cn(
                        "w-3 h-3",
                        vpsHealth.tradingLatencyMs < 50 ? 'text-success' :
                        vpsHealth.tradingLatencyMs < 100 ? 'text-warning' : 'text-destructive'
                      )} />
                      <span className={cn(
                        "text-[10px] font-mono font-bold",
                        vpsHealth.tradingLatencyMs < 50 ? 'text-success' :
                        vpsHealth.tradingLatencyMs < 100 ? 'text-warning' : 'text-destructive'
                      )}>
                        {vpsHealth.tradingLatencyMs}ms
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">VPS→Exchange trading latency (avg)</p>
                    <p className="text-[10px] text-muted-foreground">This is the actual HFT latency</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* VPS API Status - NEW */}
        {vpsHealth.ipAddress && (
          <div className="flex items-center gap-2 pl-3 border-l border-border/50">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-help">
                  <Wifi className={cn(
                    "w-3 h-3",
                    vpsApiStatus.ok ? 'text-success' : 'text-destructive'
                  )} />
                  <span className={cn(
                    "text-[10px] font-mono",
                    vpsApiStatus.ok ? 'text-success' : 'text-destructive'
                  )}>
                    {vpsApiStatus.ok ? `API ${vpsApiStatus.latencyMs}ms` : 'API Offline'}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">VPS Bot API Status</p>
                <p className="text-[10px] text-muted-foreground">Click "Test" to ping exchanges from VPS</p>
              </TooltipContent>
            </Tooltip>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleTestVpsApi}
              disabled={isTestingApi}
              className="h-5 px-1.5 text-[9px]"
            >
              {isTestingApi ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : 'Test'}
            </Button>
          </div>
        )}

        {/* Error State - Clear Error Button */}
        {botStatus === 'error' && (
          <div className="flex items-center gap-2 pl-3 border-l border-destructive/50 bg-destructive/10 px-2 py-1 rounded">
            <XCircle className="w-3.5 h-3.5 text-destructive" />
            <span className="text-[10px] text-destructive font-medium">Bot Error</span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleClearError}
              disabled={isLoading}
              className="h-5 px-2 text-[9px] border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              Clear Error
            </Button>
          </div>
        )}

            {/* Desync Warning - requires manual action */}
            {vpsHealth.desync && (
              <div className="flex items-center gap-2 pl-2 bg-warning/10 px-2 py-1 rounded">
                <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                <span className="text-[10px] text-warning font-medium">
                  VPS: {vpsHealth.botStatus} ≠ UI: {botStatus}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    // Manually update DB to match VPS reality
                    setIsLoading(true);
                    try {
                      const updateTime = new Date().toISOString();
                      const newStatus = vpsHealth.botStatus === 'running' ? 'running' : 'stopped';
                      await supabase.from('trading_config')
                        .update({ 
                          bot_status: newStatus, 
                          trading_enabled: newStatus === 'running',
                          updated_at: updateTime 
                        })
                        .neq('id', '00000000-0000-0000-0000-000000000000');
                      setBotStatus(newStatus as BotStatus);
                      toast.success(`Synced UI to VPS state: ${newStatus}`);
                      refreshVpsHealth();
                    } catch (err) {
                      toast.error('Failed to sync');
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  disabled={isLoading}
                  className="h-5 px-2 text-[9px] border-warning text-warning hover:bg-warning hover:text-warning-foreground"
                >
                  Adopt VPS State
                </Button>
              </div>
            )}
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

            <Activity className={`w-4 h-4 ml-2 ${botStatus === 'running' ? 'text-success' : 'text-muted-foreground'}`} />
          </div>
        </div>

        {/* Startup Progress Bar */}
        {isStartingUp && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{getStartupMessage()}</span>
              <span className="text-muted-foreground">{startupProgress}%</span>
            </div>
            <Progress value={startupProgress} className="h-1" />
          </div>
        )}
        </Card>

      {/* Live Mode Start Confirmation Dialog */}
      <AlertDialog open={showStartConfirm} onOpenChange={setShowStartConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">⚠️ Start Bot in LIVE Mode?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This will start the trading bot in <strong className="text-destructive">LIVE mode</strong>. 
                All trades will be executed with real money on connected exchanges.
              </p>
              <p className="text-destructive font-medium">
                Real funds are at risk. Ensure your risk settings are configured properly.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleStartBot}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Start LIVE Trading
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
