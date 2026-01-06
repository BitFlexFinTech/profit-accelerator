import { useState } from 'react';
import { Zap, StopCircle, RefreshCw, Bell, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function QuickActionsPanel() {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

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

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
      
      <div className="grid grid-cols-2 gap-3">
        <Button 
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
        </Button>
        
        <Button 
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
        </Button>
        
        <Button 
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
        </Button>
        
        <Button 
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
        </Button>
      </div>
    </div>
  );
}
