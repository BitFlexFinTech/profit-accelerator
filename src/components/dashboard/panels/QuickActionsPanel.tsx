import { useState } from 'react';
import { Zap, StopCircle, RefreshCw, Bell, Loader2, Play, Square, RotateCcw } from 'lucide-react';
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
    if (tokyoDeployment) {
      await startBot(tokyoDeployment.id);
    } else {
      toast.error('No VPS deployment found');
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
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
      
      {/* Bot Status & Controls */}
      <div className="mb-4 p-3 rounded-lg bg-muted/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Bot Status:</span>
            <Badge 
              variant="outline" 
              className={
                botStatus === 'running' 
                  ? 'bg-success/20 text-success border-success/40' 
                  : 'bg-muted text-muted-foreground'
              }
            >
              <span className={`w-2 h-2 rounded-full mr-1.5 ${botStatus === 'running' ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
              {botStatus.toUpperCase()}
            </Badge>
          </div>
        </div>
        
        <div className="flex gap-2">
          <ActionButton
            tooltip={BUTTON_TOOLTIPS.startBot}
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5 hover:bg-success/10 hover:border-success/50"
            onClick={handleStartBot}
            disabled={actionLoading || botStatus === 'running' || !tokyoDeployment ? true : false}
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 text-success" />}
            Start
          </ActionButton>
          
          <ActionButton
            tooltip={BUTTON_TOOLTIPS.stopBot}
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5 hover:bg-destructive/10 hover:border-destructive/50"
            onClick={handleStopBot}
            disabled={actionLoading || botStatus === 'stopped' || !tokyoDeployment ? true : false}
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 text-destructive" />}
            Stop
          </ActionButton>
          
          <ActionButton
            tooltip={BUTTON_TOOLTIPS.restartBot}
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5"
            onClick={handleRestartBot}
            disabled={actionLoading || !tokyoDeployment ? true : false}
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Restart
          </ActionButton>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <ActionButton 
          tooltip={BUTTON_TOOLTIPS.startTrading}
          variant="outline" 
          className="h-auto py-4 flex flex-col gap-2 hover:bg-success/10 hover:border-success/50"
          onClick={handleStartTrading}
          disabled={loadingAction === 'start'}
        >
          {loadingAction === 'start' ? (
            <Loader2 className="w-5 h-5 animate-spin text-success" />
          ) : (
            <Zap className="w-5 h-5 text-success" />
          )}
          <span className="text-sm">Start Trading</span>
        </ActionButton>
        
        <ActionButton 
          tooltip={BUTTON_TOOLTIPS.pauseAll}
          variant="outline" 
          className="h-auto py-4 flex flex-col gap-2 hover:bg-destructive/10 hover:border-destructive/50"
          onClick={handlePauseAll}
          disabled={loadingAction === 'pause'}
        >
          {loadingAction === 'pause' ? (
            <Loader2 className="w-5 h-5 animate-spin text-destructive" />
          ) : (
            <StopCircle className="w-5 h-5 text-destructive" />
          )}
          <span className="text-sm">Pause All</span>
        </ActionButton>
        
        <ActionButton 
          tooltip={BUTTON_TOOLTIPS.syncBalances}
          variant="outline" 
          className="h-auto py-4 flex flex-col gap-2 hover:bg-accent/10 hover:border-accent/50"
          onClick={handleSyncBalances}
          disabled={loadingAction === 'sync'}
        >
          {loadingAction === 'sync' ? (
            <Loader2 className="w-5 h-5 animate-spin text-accent" />
          ) : (
            <RefreshCw className="w-5 h-5 text-accent" />
          )}
          <span className="text-sm">Sync Balances</span>
        </ActionButton>
        
        <ActionButton 
          tooltip={BUTTON_TOOLTIPS.testAlert}
          variant="outline" 
          className="h-auto py-4 flex flex-col gap-2 hover:bg-primary/10 hover:border-primary/50"
          onClick={handleTestAlert}
          disabled={loadingAction === 'alert'}
        >
          {loadingAction === 'alert' ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          ) : (
            <Bell className="w-5 h-5 text-primary" />
          )}
          <span className="text-sm">Test Alert</span>
        </ActionButton>
      </div>
    </div>
  );
}
