import { useState, useEffect } from 'react';
import { StatusDot } from '@/components/ui/StatusDot';
import { Play, Square, AlertTriangle, Loader2, RefreshCw, Zap, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useExchangeWebSocket } from '@/hooks/useExchangeWebSocket';
import { useAppStore } from '@/store/useAppStore';
import { ActionButton } from '@/components/ui/ActionButton';
import { BUTTON_TOOLTIPS } from '@/config/buttonTooltips';
import { useVPSHealthPolling } from '@/hooks/useVPSHealthPolling';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type BotStatus = 'idle' | 'running' | 'stopped' | 'error' | 'starting' | 'standby';

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
  const [showLiveConfirm, setShowLiveConfirm] = useState(false);
  
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
      const { data, error } = await supabase
        .from('trading_config')
        .select('bot_status, trading_enabled')
        .maybeSingle();

      if (!error && data) {
        const config = data as TradingConfig;
        setBotStatus((config.bot_status as BotStatus) || 'idle');
      }
      setIsLoading(false);
    };

    fetchStatus();

    const channel = supabase
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleStartBot = async () => {
    setIsStarting(true);
    try {
      // CRITICAL: Disable kill switch FIRST before starting bot
      console.log('[BotControl] Disabling kill switch...');
      await supabase.from('trading_config')
        .update({ 
          global_kill_switch_enabled: false,
          updated_at: new Date().toISOString()
        })
        .neq('id', '00000000-0000-0000-0000-000000000000');

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
        toast.error('No VPS deployment found. Please deploy a VPS first.');
        setIsStarting(false);
        return;
      }

      // Set status to 'starting' immediately for UI feedback
      setBotStatus('starting');

      // Call bot-control edge function
      const { data, error: vpsError } = await supabase.functions.invoke('bot-control', {
        body: { action: 'start', deploymentId }
      });

      if (vpsError) {
        console.error('[BotControl] VPS signal error:', vpsError);
        toast.error('Failed to start VPS bot: ' + vpsError.message);
        setBotStatus('error');
        return;
      }

      if (!data?.success) {
        console.error('[BotControl] Bot start failed:', data?.error);
        toast.error('Bot start failed: ' + (data?.error || 'Unknown error'));
        setBotStatus('error');
        return;
      }

      // SUCCESS: VPS confirmed bot started
      console.log('[BotControl] Bot start result:', data);
      
      if (data.healthVerified) {
        setBotStatus('running');
        toast.success(`Bot started and verified on ${data.ipAddress}`);
      } else {
        // Bot container started but health not verified yet
        setBotStatus('running');
        toast.success(`Bot started on ${data.ipAddress} (health check pending)`);
        
        // Trigger health refresh after a delay
        setTimeout(() => refreshHealth(), 5000);
      }

      // Update vps_config if we have a provider
      if (provider) {
        await supabase.from('vps_config')
          .update({ status: 'running' })
          .eq('provider', provider);
      }

    } catch (error) {
      console.error('[BotControl] Start error:', error);
      toast.error('Failed to start bot');
      setBotStatus('error');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStartClick = () => {
    setShowLiveConfirm(true);
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
        return (
          <Badge className="bg-success/20 text-success border-success/40 gap-1.5">
                    <StatusDot color="success" pulse />
            RUNNING
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

        {/* Live Mode Warning */}
        {botStatus !== 'running' && botStatus !== 'starting' && (
          <div className="mt-3 p-2 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-2 animate-pulse">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-sm text-destructive font-medium">
              ⚠️ LIVE MODE: Starting the bot will execute REAL trades with your ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} equity.
            </span>
          </div>
        )}
      </div>

      <AlertDialog open={showLiveConfirm} onOpenChange={setShowLiveConfirm}>
        <AlertDialogContent className="border-destructive">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Confirm LIVE Trading
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="font-semibold text-foreground">
                You are about to start the bot in LIVE MODE.
              </p>
              <p>
                This will execute <span className="text-destructive font-bold">REAL trades</span> with your{' '}
                <span className="text-destructive font-bold">
                  ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>{' '}
                equity on connected exchanges.
              </p>
              <p className="text-sm text-muted-foreground">
                Are you absolutely sure you want to proceed?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStartBot}
              className="bg-destructive hover:bg-destructive/90"
            >
              Yes, Start LIVE Trading
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
