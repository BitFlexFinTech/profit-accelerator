import { useState, useEffect } from 'react';
import { StatusDot } from '@/components/ui/StatusDot';
import { Play, Square, AlertTriangle, Loader2, RefreshCw, Zap, CheckCircle2, XCircle, AlertCircle, Upload, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useExchangeWebSocket } from '@/hooks/useExchangeWebSocket';
import { useAppStore } from '@/store/useAppStore';
import { ActionButton } from '@/components/ui/ActionButton';
import { BUTTON_TOOLTIPS } from '@/config/buttonTooltips';
import { useVPSHealthPolling } from '@/hooks/useVPSHealthPolling';
import { DeployVPSApiButton } from '@/components/vps/DeployVPSApiButton';
import { BotPreflightDialog } from '@/components/dashboard/BotPreflightDialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type BotStatus = 'idle' | 'running' | 'stopped' | 'error' | 'starting' | 'standby' | 'waiting_signals';

interface TradingConfig {
  bot_status: BotStatus;
  trading_enabled: boolean;
}

export function BotControlPanel() {
  const [botStatus, setBotStatus] = useState<BotStatus>('idle');
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showPreflightDialog, setShowPreflightDialog] = useState(false);
  const [recentSignalCount, setRecentSignalCount] = useState(0);
  
  const { sync } = useExchangeWebSocket();
  const getTotalEquity = useAppStore(state => state.getTotalEquity);
  
  // VPS Health Polling - verifies actual VPS state every 30 seconds
  const { health: vpsHealth, isPolling: isHealthPolling, refresh: refreshHealth, forceSync } = useVPSHealthPolling({
    pollIntervalMs: 30000,
    enabled: true,
  });

  const handleSyncBalances = async () => {
    setIsSyncing(true);
    try {
      await sync();
      toast.success('Balance sync triggered');
    } catch (error) {
      toast.error('Failed to sync balances');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const fetchStatus = async () => {
      setIsLoading(true);
      // Use dashboard-state edge function to bypass RLS
      const { data, error } = await supabase.functions.invoke('dashboard-state');

      if (!error && data?.bot?.status) {
        const dbStatus = data.bot.status as BotStatus;
        setBotStatus(dbStatus);
      }
      setIsLoading(false);
    };

    // Also check for recent LONG signals from ai_market_updates (what bot actually uses)
    const checkSignals = async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('ai_market_updates')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', fiveMinutesAgo)
        .gte('confidence', 70)
        .in('recommended_side', ['long', 'buy']); // SPOT mode: LONG only
      setRecentSignalCount(count || 0);
    };

    fetchStatus();
    checkSignals();

    const statusChannel = supabase
      .channel('bot-control-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trading_config'
      }, (payload) => {
        const newData = payload.new as TradingConfig;
        if (newData.bot_status) {
          setBotStatus(newData.bot_status as BotStatus);
        }
      })
      .subscribe();

    // Also listen for new signals
    const signalChannel = supabase
      .channel('signal-updates')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bot_signals'
      }, () => {
        checkSignals();
        // If bot is waiting for signals and a signal arrives, notify user
        if (botStatus === 'running' || botStatus === 'waiting_signals') {
          toast.info('New trade signal received! Bot is processing...');
        }
      })
      .subscribe();

    const signalInterval = setInterval(checkSignals, 30000);

    return () => {
      supabase.removeChannel(statusChannel);
      supabase.removeChannel(signalChannel);
      clearInterval(signalInterval);
    };
  }, [botStatus]);

  const handleStartBot = async () => {
    setIsStarting(true);
    try {
      console.log('[BotControl] Calling bot-lifecycle start...');
      setBotStatus('starting');

      // Call the new bot-lifecycle function for pure bot control
      const { data, error: startError } = await supabase.functions.invoke('bot-lifecycle', {
        body: { action: 'start' }
      });

      if (startError) {
        console.error('[BotControl] bot-lifecycle error:', startError);
        toast.error('Failed to start: ' + startError.message);
        setBotStatus('error');
        return;
      }

      console.log('[BotControl] bot-lifecycle result:', data);

      if (!data?.success) {
        toast.error('Failed to start bot', {
          description: data?.message || 'Unknown error',
          duration: 8000,
        });
        setBotStatus(data?.botStatus || 'error');
        return;
      }

      // Bot started successfully
      setBotStatus(data.botStatus || 'running');
      toast.success('✅ Bot started successfully', {
        description: data.message || 'Bot is now running',
        duration: 5000,
      });

      // Refresh health after start
      setTimeout(() => refreshHealth(), 3000);

    } catch (error) {
      console.error('[BotControl] Start error:', error);
      toast.error('Failed to start bot');
      setBotStatus('error');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStartClick = () => {
    // Show preflight dialog instead of simple confirm
    setShowPreflightDialog(true);
  };

  // Send test signal handler
  const [isSendingTestSignal, setIsSendingTestSignal] = useState(false);
  const handleSendTestSignal = async () => {
    setIsSendingTestSignal(true);
    try {
      const { data, error } = await supabase.functions.invoke('bot-signal-receiver', {
        body: {
          bot_name: 'test',
          symbol: 'BTCUSDT',
          side: 'long',
          confidence: 85,
          exchange_name: 'binance',
          timeframe_minutes: 5,
          current_price: 0
        }
      });

      if (error) throw error;

      toast.success('Test signal sent!', {
        description: `Signal ID: ${data?.signal_id?.slice(0, 8)}... - Bot should process within 30s`
      });
      
      // Refresh signal count
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('bot_signals')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', fiveMinutesAgo);
      setRecentSignalCount(count || 0);
    } catch (error) {
      console.error('[BotControl] Test signal failed:', error);
      toast.error('Failed to send test signal');
    } finally {
      setIsSendingTestSignal(false);
    }
  };

  const handleStopBot = async () => {
    setIsStopping(true);
    try {
      // Get deployment from hft_deployments
      const { data: deployment } = await supabase
        .from('hft_deployments')
        .select('id, server_id, ip_address, provider')
        .in('status', ['active', 'running'])
        .limit(1)
        .single();

      // Also check vps_instances as backup
      const { data: vpsInstance } = await supabase
        .from('vps_instances')
        .select('id, deployment_id, ip_address, provider')
        .eq('status', 'running')
        .limit(1)
        .single();

      const deploymentId = deployment?.id || deployment?.server_id || vpsInstance?.deployment_id || vpsInstance?.id;
      const provider = deployment?.provider || vpsInstance?.provider;

      if (!deploymentId) {
        toast.error('No VPS deployment found');
        setIsStopping(false);
        return;
      }

      // Call bot-control edge function
      const { data, error: vpsError } = await supabase.functions.invoke('bot-control', {
        body: { action: 'stop', deploymentId }
      });

      if (vpsError) {
        console.error('[BotControl] VPS signal error:', vpsError);
        toast.error('Failed to stop VPS bot: ' + vpsError.message);
        // Still update local state as stop is critical
      } else if (!data?.success) {
        console.error('[BotControl] Bot stop failed:', data?.error);
        toast.error('Bot stop may have failed: ' + (data?.error || 'Unknown error'));
      } else {
        console.log('[BotControl] Bot stop result:', data);
        toast.success('Bot stopped successfully');
      }

      // Update local state after VPS command (stop is critical, always update)
      setBotStatus('stopped');

      // Update vps_config if we have a provider
      if (provider) {
        await supabase.from('vps_config')
          .update({ status: 'idle' })
          .eq('provider', provider);
      }

      // Refresh health to verify
      setTimeout(() => refreshHealth(), 2000);

    } catch (error) {
      console.error('[BotControl] Stop error:', error);
      toast.error('Failed to stop bot');
    } finally {
      setIsStopping(false);
    }
  };

  const handleClearError = async () => {
    try {
      await supabase.from('trading_config')
        .update({ 
          bot_status: 'stopped', 
          updated_at: new Date().toISOString()
        })
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      await supabase.from('hft_deployments')
        .update({ bot_status: 'stopped', updated_at: new Date().toISOString() })
        .eq('bot_status', 'error');
      
      await supabase.from('vps_instances')
        .update({ bot_status: 'stopped', updated_at: new Date().toISOString() })
        .eq('bot_status', 'error');
      
      setBotStatus('stopped');
      toast.success('Error state cleared - bot ready to start');
      
      // Refresh health
      refreshHealth();
    } catch (error) {
      console.error('[BotControl] Clear error failed:', error);
      toast.error('Failed to clear error state');
    }
  };

  const handleForceSync = async () => {
    toast.info('Syncing with VPS...');
    await forceSync();
    toast.success('State synchronized with VPS');
  };

  const getStatusBadge = () => {
    switch (botStatus) {
      case 'running':
        // If running but no recent signals, show "waiting for signals"
        if (recentSignalCount === 0) {
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="bg-warning/20 text-warning border-warning/40 gap-1.5 cursor-help">
                    <StatusDot color="warning" pulse />
                    WAITING SIGNALS
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Bot is running but waiting for trade signals.</p>
                  <p className="text-xs text-muted-foreground">No signals received in last 5 minutes.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="bg-success/20 text-success border-success/40 gap-1.5 cursor-help">
                  <StatusDot color="success" pulse />
                  RUNNING
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Bot is actively trading.</p>
                <p className="text-xs text-muted-foreground">{recentSignalCount} signal(s) in last 5 minutes.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'waiting_signals':
        return (
          <Badge className="bg-warning/20 text-warning border-warning/40 gap-1.5">
            <StatusDot color="warning" pulse />
            WAITING SIGNALS
          </Badge>
        );
      case 'starting':
        return (
          <Badge className="bg-warning/20 text-warning border-warning/40 gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            STARTING
          </Badge>
        );
      case 'standby':
        return (
          <Badge className="bg-warning/20 text-warning border-warning/40 gap-1.5">
            <StatusDot color="warning" pulse />
            STANDBY
          </Badge>
        );
      case 'stopped':
        return (
          <Badge className="bg-destructive/20 text-destructive border-destructive/40">
            STOPPED
          </Badge>
        );
      case 'error':
        return (
          <Badge className="bg-warning/20 text-warning border-warning/40 gap-1.5">
            <AlertTriangle className="w-3 h-3" />
            ERROR
          </Badge>
        );
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border-border">
            IDLE
          </Badge>
        );
    }
  };

  const getVPSHealthIndicator = () => {
    const lastVerifiedText = vpsHealth.lastVerified 
      ? `Last verified: ${vpsHealth.lastVerified.toLocaleTimeString()}`
      : 'Not verified yet';
    
    const latencyText = vpsHealth.latencyMs 
      ? ` (${vpsHealth.latencyMs}ms)`
      : '';

    switch (vpsHealth.status) {
      case 'healthy':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-success">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs">VPS OK</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{lastVerifiedText}{latencyText}</p>
                {vpsHealth.ipAddress && <p>IP: {vpsHealth.ipAddress}</p>}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'unhealthy':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-warning">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-xs">VPS Idle</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>VPS reachable but bot not running</p>
                <p>{lastVerifiedText}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'unreachable':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-destructive">
                  <XCircle className="w-4 h-4" />
                  <span className="text-xs">VPS Unreachable</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Cannot reach VPS health endpoint</p>
                <p>{lastVerifiedText}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      default:
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-muted-foreground">
                  {isHealthPolling ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  <span className="text-xs">Checking...</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Verifying VPS status...</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
    }
  };

  const totalEquity = getTotalEquity();

  if (isLoading) {
    return (
      <div className="glass-card p-4 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="glass-card p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Bot Status:</span>
              {getStatusBadge()}
            </div>
            {/* VPS Health Indicator */}
            <div className="border-l border-border pl-4">
              {getVPSHealthIndicator()}
            </div>
            {/* Desync Warning */}
            {vpsHealth.desync && (
              <div className="flex items-center gap-2 px-2 py-1 rounded bg-warning/10 border border-warning/30">
                <AlertTriangle className="w-4 h-4 text-warning" />
                <span className="text-xs text-warning">State mismatch detected</span>
                <ActionButton
                  tooltip="Force sync with VPS"
                  variant="ghost"
                  size="sm"
                  onClick={handleForceSync}
                  className="h-6 px-2 text-xs"
                >
                  Sync
                </ActionButton>
              </div>
            )}
            {/* Deploy API Button for VPS issues */}
            {vpsHealth.status === 'unreachable' && (
              <div className="border-l border-border pl-3">
                <DeployVPSApiButton />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Live Mode Indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/30">
              <Zap className="w-4 h-4 text-destructive" />
              <span className="text-xs font-medium text-destructive">LIVE MODE</span>
            </div>

            <ActionButton
              tooltip={BUTTON_TOOLTIPS.syncBalances}
              variant="outline"
              size="sm"
              onClick={handleSyncBalances}
              disabled={isSyncing}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync
            </ActionButton>

            {/* Test Signal Button - visible when bot is running */}
            {(botStatus === 'running' || botStatus === 'waiting_signals') && (
              <ActionButton
                tooltip="Send a test BTC LONG signal to verify bot is processing signals"
                variant="outline"
                size="sm"
                onClick={handleSendTestSignal}
                disabled={isSendingTestSignal}
                className="gap-2"
              >
                {isSendingTestSignal ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Test Signal
              </ActionButton>
            )}

            {botStatus === 'running' ? (
              <ActionButton 
                tooltip={BUTTON_TOOLTIPS.stopBot}
                variant="destructive" 
                onClick={handleStopBot}
                disabled={isStopping}
                className="gap-2"
              >
                {isStopping ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                STOP BOT
              </ActionButton>
            ) : botStatus === 'starting' ? (
              <ActionButton 
                tooltip="Bot is starting..."
                disabled
                className="gap-2 bg-warning/20 text-warning border-warning/40"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                STARTING...
              </ActionButton>
            ) : botStatus === 'error' ? (
              <>
                <ActionButton 
                  tooltip="Clear error state and reset bot"
                  variant="outline"
                  onClick={handleClearError}
                  className="gap-2 border-warning text-warning hover:bg-warning/10"
                >
                  <RefreshCw className="w-4 h-4" />
                  Clear Error
                </ActionButton>
                <ActionButton 
                  tooltip={BUTTON_TOOLTIPS.startBot}
                  onClick={handleStartClick}
                  disabled={isStarting}
                  className="gap-2 bg-destructive hover:bg-destructive/90"
                >
                  {isStarting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Restart Bot
                </ActionButton>
              </>
            ) : (
              <ActionButton 
                tooltip={BUTTON_TOOLTIPS.startBot}
                onClick={handleStartClick}
                disabled={isStarting}
                className="gap-2 bg-destructive hover:bg-destructive/90"
              >
                {isStarting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                <AlertTriangle className="w-4 h-4" />
                START BOT
              </ActionButton>
            )}
          </div>
        </div>

        {/* Status Info - show when running */}
        {(botStatus === 'running' || botStatus === 'waiting_signals') && (
          <div className="mt-3 p-2 rounded-lg bg-muted/50 border border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {recentSignalCount > 0 ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span className="text-sm text-muted-foreground">
                    <span className="text-success font-medium">{recentSignalCount}</span> signal(s) received in last 5 min
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-warning" />
                  <span className="text-sm text-muted-foreground">
                    No signals in last 5 min - bot is waiting for AI/strategy signals
                  </span>
                </>
              )}
            </div>
            <ActionButton
              tooltip="Send a test BTC LONG signal"
              variant="ghost"
              size="sm"
              onClick={handleSendTestSignal}
              disabled={isSendingTestSignal}
              className="gap-1 text-xs h-6"
            >
              {isSendingTestSignal ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Send Test
            </ActionButton>
          </div>
        )}

        {/* Live Mode Warning - only when stopped */}
        {botStatus !== 'running' && botStatus !== 'starting' && botStatus !== 'waiting_signals' && (
          <div className="mt-3 p-2 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-2 animate-pulse">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-sm text-destructive font-medium">
              ⚠️ LIVE MODE: Starting the bot will execute REAL trades with your ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} equity.
            </span>
          </div>
        )}
      </div>

      <BotPreflightDialog 
        open={showPreflightDialog} 
        onOpenChange={setShowPreflightDialog}
        onConfirmStart={handleStartBot}
      />
    </>
  );
}
