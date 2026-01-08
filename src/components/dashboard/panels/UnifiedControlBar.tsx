import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Play, 
  Square, 
  RefreshCw, 
  Bell, 
  Zap,
  Pause,
  Activity
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function UnifiedControlBar() {
  const [botStatus, setBotStatus] = useState<'running' | 'stopped' | 'idle'>('idle');
  const [isPaperMode, setIsPaperMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchBotStatus();
    const interval = setInterval(fetchBotStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchBotStatus = async () => {
    const { data } = await supabase
      .from('trading_config')
      .select('bot_status, trading_mode')
      .single();
    
    if (data) {
      setBotStatus(data.bot_status as 'running' | 'stopped' | 'idle' || 'idle');
      setIsPaperMode(data.trading_mode === 'paper');
    }
  };

  const handleStartBot = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('bot-control', {
        body: { action: 'start' }
      });
      if (error) throw error;
      setBotStatus('running');
      toast.success('Bot started successfully');
    } catch (err) {
      toast.error('Failed to start bot');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopBot = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('bot-control', {
        body: { action: 'stop' }
      });
      if (error) throw error;
      setBotStatus('stopped');
      toast.success('Bot stopped');
    } catch (err) {
      toast.error('Failed to stop bot');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncBalances = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('exchange-websocket', {
        body: { action: 'sync-balances' }
      });
      if (error) throw error;
      toast.success('Balances synced');
    } catch (err) {
      toast.error('Sync failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestAlert = async () => {
    toast.info('🔔 Test alert sent!');
  };

  const handleModeToggle = async (checked: boolean) => {
    setIsPaperMode(checked);
    await supabase
      .from('trading_config')
      .update({ trading_mode: checked ? 'paper' : 'live' })
      .eq('id', (await supabase.from('trading_config').select('id').single()).data?.id);
    toast.success(`Switched to ${checked ? 'Paper' : 'Live'} trading`);
  };

  const statusColor = {
    running: 'bg-green-500',
    stopped: 'bg-red-500',
    idle: 'bg-yellow-500'
  };

  return (
    <Card className="p-2 bg-card/50 border-border/50">
      <div className="flex items-center justify-between gap-4">
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
            <span className={`text-[10px] font-medium ${!isPaperMode ? 'text-foreground' : 'text-muted-foreground'}`}>
              LIVE
            </span>
            <Switch
              checked={isPaperMode}
              onCheckedChange={handleModeToggle}
              className="scale-75"
            />
            <span className={`text-[10px] font-medium ${isPaperMode ? 'text-foreground' : 'text-muted-foreground'}`}>
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
              className="h-7 text-xs px-2 bg-green-600 hover:bg-green-700"
            >
              <Play className="w-3 h-3 mr-1" />
              Start
            </Button>
          )}

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
            onClick={handleTestAlert}
            className="h-7 text-xs px-2"
          >
            <Bell className="w-3 h-3 mr-1" />
            Alert
          </Button>

          <div className="h-4 w-px bg-border/50 mx-1" />

          <Button 
            size="sm" 
            variant={botStatus === 'running' ? 'outline' : 'default'}
            onClick={botStatus === 'running' ? handleStopBot : handleStartBot}
            disabled={isLoading}
            className="h-7 text-xs px-2"
          >
            {botStatus === 'running' ? (
              <>
                <Pause className="w-3 h-3 mr-1" />
                Pause All
              </>
            ) : (
              <>
                <Zap className="w-3 h-3 mr-1" />
                Trade
              </>
            )}
          </Button>

          <Activity className="w-4 h-4 text-green-500 ml-2" />
        </div>
      </div>
    </Card>
  );
}
