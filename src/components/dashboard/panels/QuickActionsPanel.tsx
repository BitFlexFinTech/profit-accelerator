import { useState } from 'react';
import { Zap, StopCircle, RefreshCw, Bell, Loader2, Play, Square, RotateCcw } from 'lucide-react';
import { StatusDot } from '@/components/ui/StatusDot';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useHFTDeployments } from '@/hooks/useHFTDeployments';
import { ActionButton } from '@/components/ui/ActionButton';
import { BUTTON_TOOLTIPS } from '@/config/buttonTooltips';

export function QuickActionsPanel() {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const { deployments, startBot, stopBot, restartBot, actionLoading, getTokyoDeployment } = useHFTDeployments();
  
  const tokyoDeployment = getTokyoDeployment();
  const botStatus = tokyoDeployment?.bot_status || 'stopped';

  const handleStartTrading = async () => {
    setLoadingAction('start');
    try {
      const { error } = await supabase
        .from('trading_config')
        .update({ trading_enabled: true, global_kill_switch_enabled: false })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      await supabase
        .from('vps_config')
        .update({ status: 'running' })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;
      toast.success('Trading enabled');
    } catch {
      toast.error('Failed to start trading');
    } finally {
      setLoadingAction(null);
    }
  };

  const handlePauseAll = async () => {
    setLoadingAction('pause');
    try {
      const { error } = await supabase
        .from('trading_config')
        .update({ trading_enabled: false })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;
      toast.success('Trading paused');
    } catch {
      toast.error('Failed to pause trading');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSyncBalances = async () => {
    setLoadingAction('sync');
    try {
      const response = await supabase.functions.invoke('trade-engine', {
        body: { action: 'sync-balances' }
      });

      if (response.data?.success) {
        toast.success('Balances synced');
      } else {
        toast.error(response.data?.error || 'Failed to sync balances');
      }
    } catch {
      toast.error('Failed to sync balances');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleTestAlert = async () => {
    setLoadingAction('alert');
    try {
      const response = await supabase.functions.invoke('telegram-bot', {
        body: { 
          action: 'send-message',
          message: '🧪 <b>Test Alert</b>\n\nThis is a test notification from your HFT Command Center.'
        }
      });

      if (response.data?.success) {
        toast.success('Test alert sent to Telegram');
      } else {
        toast.error(response.data?.error || 'Failed to send alert');
      }
    } catch {
      toast.error('Failed to send test alert');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleStartBot = async () => {
    if (!tokyoDeployment) {
      toast.error('No VPS deployment found');
      return;
    }
    
    setLoadingAction('start-bot');
    try {
      // Use start-live-now for immediate trade execution
      const response = await supabase.functions.invoke('start-live-now', {});
      
      if (response.data?.success) {
        const successOrders = response.data.orders?.filter((o: any) => o.status === 'filled') || [];
        if (successOrders.length > 0) {
          const summary = successOrders.map((o: any) => 
            `${o.exchange}: ${o.symbol} @ $${o.price.toFixed(2)}`
          ).join(', ');
          toast.success(`Trade executed: ${summary}`);
        } else {
          toast.success('Bot started');
        }
      } else if (response.data?.blockingReason) {
        toast.error('Cannot start', { description: response.data.blockingReason });
      } else {
        toast.error('Start failed');
      }
    } catch (err) {
      toast.error('Failed to start bot');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleStopBot = async () => {
    if (tokyoDeployment) {
      await stopBot(tokyoDeployment.id);
    } else {
      toast.error('No VPS deployment found');
    }
  };

  const handleRestartBot = async () => {
    if (tokyoDeployment) {
      await restartBot(tokyoDeployment.id);
    } else {
      toast.error('No VPS deployment found');
    }
  };

  return (
    <div className="glass-card card-purple p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <div className="icon-container-purple p-1.5 rounded-md">
          <Zap className="w-4 h-4 text-purple-accent" />
        </div>
        Quick Actions
      </h3>
      
      {/* Bot Status & Controls */}
      <div className="mb-4 p-3 rounded-lg bg-secondary/30 border border-purple-accent/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Bot Status:</span>
            <Badge 
              variant="outline" 
              className={
                botStatus === 'running' 
                  ? 'bg-green-accent/20 text-green-accent border-green-accent/40 animate-pulse' 
                  : botStatus === 'standby'
                  ? 'bg-warning/20 text-warning border-warning/40 animate-pulse'
                  : 'bg-muted text-muted-foreground'
              }
            >
              <StatusDot 
                color={botStatus === 'running' ? 'success' : botStatus === 'standby' ? 'warning' : 'muted'} 
                pulse={botStatus === 'running' || botStatus === 'standby'}
                className="mr-1.5"
              />
              {botStatus.toUpperCase()}
            </Badge>
          </div>
        </div>
        
        <div className="flex gap-2">
          <ActionButton
            tooltip={BUTTON_TOOLTIPS.startBot}
            colorVariant="green"
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5"
            onClick={handleStartBot}
            disabled={actionLoading || botStatus === 'running' || !tokyoDeployment ? true : false}
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 text-green-accent" />}
            Start
          </ActionButton>
          
          <ActionButton
            tooltip={BUTTON_TOOLTIPS.stopBot}
            colorVariant="red"
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5"
            onClick={handleStopBot}
            disabled={actionLoading || botStatus === 'stopped' || !tokyoDeployment ? true : false}
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 text-red-accent" />}
            Stop
          </ActionButton>
          
          <ActionButton
            tooltip={BUTTON_TOOLTIPS.restartBot}
            colorVariant="orange"
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5"
            onClick={handleRestartBot}
            disabled={actionLoading || !tokyoDeployment ? true : false}
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4 text-orange" />}
            Restart
          </ActionButton>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <ActionButton 
          tooltip={BUTTON_TOOLTIPS.startTrading}
          colorVariant="green"
          variant="outline" 
          className="h-auto py-4 flex flex-col gap-2"
          onClick={handleStartTrading}
          disabled={loadingAction === 'start'}
        >
          {loadingAction === 'start' ? (
            <Loader2 className="w-5 h-5 animate-spin text-green-accent" />
          ) : (
            <Zap className="w-5 h-5 text-green-accent" />
          )}
          <span className="text-sm">Start Trading</span>
        </ActionButton>
        
        <ActionButton 
          tooltip={BUTTON_TOOLTIPS.pauseAll}
          colorVariant="red"
          variant="outline" 
          className="h-auto py-4 flex flex-col gap-2"
          onClick={handlePauseAll}
          disabled={loadingAction === 'pause'}
        >
          {loadingAction === 'pause' ? (
            <Loader2 className="w-5 h-5 animate-spin text-red-accent" />
          ) : (
            <StopCircle className="w-5 h-5 text-red-accent" />
          )}
          <span className="text-sm">Pause All</span>
        </ActionButton>
        
        <ActionButton 
          tooltip={BUTTON_TOOLTIPS.syncBalances}
          colorVariant="cyan"
          variant="outline" 
          className="h-auto py-4 flex flex-col gap-2"
          onClick={handleSyncBalances}
          disabled={loadingAction === 'sync'}
        >
          {loadingAction === 'sync' ? (
            <Loader2 className="w-5 h-5 animate-spin text-cyan" />
          ) : (
            <RefreshCw className="w-5 h-5 text-cyan" />
          )}
          <span className="text-sm">Sync Balances</span>
        </ActionButton>
        
        <ActionButton 
          tooltip={BUTTON_TOOLTIPS.testAlert}
          colorVariant="magenta"
          variant="outline" 
          className="h-auto py-4 flex flex-col gap-2"
          onClick={handleTestAlert}
          disabled={loadingAction === 'alert'}
        >
          {loadingAction === 'alert' ? (
            <Loader2 className="w-5 h-5 animate-spin text-magenta" />
          ) : (
            <Bell className="w-5 h-5 text-magenta" />
          )}
          <span className="text-sm">Test Alert</span>
        </ActionButton>
      </div>
    </div>
  );
}
