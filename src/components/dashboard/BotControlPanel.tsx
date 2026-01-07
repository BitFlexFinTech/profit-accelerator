import { useState, useEffect } from 'react';
import { Play, Square, AlertTriangle, Loader2, FlaskConical, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useExchangeWebSocket } from '@/hooks/useExchangeWebSocket';

type BotStatus = 'idle' | 'running' | 'stopped';

interface TradingConfig {
  bot_status: BotStatus;
  trading_enabled: boolean;
  test_mode: boolean;
}

export function BotControlPanel() {
  const [botStatus, setBotStatus] = useState<BotStatus>('idle');
  const [testMode, setTestMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const { sync } = useExchangeWebSocket();

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
        .select('bot_status, trading_enabled, test_mode')
        .single();

      if (!error && data) {
        const config = data as TradingConfig;
        setBotStatus((config.bot_status as BotStatus) || 'idle');
        setTestMode(config.test_mode ?? true);
      }
      setIsLoading(false);
    };

    fetchStatus();

    // Subscribe to realtime changes
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
        if (typeof newData.test_mode === 'boolean') {
          setTestMode(newData.test_mode);
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
      // Get active VPS IP dynamically
      const { data: vpsConfig } = await supabase
        .from('vps_config')
        .select('outbound_ip, provider')
        .not('outbound_ip', 'is', null)
        .limit(1)
        .single();

      const serverIp = vpsConfig?.outbound_ip;
      const provider = vpsConfig?.provider;

      // 1. Signal VPS to start (if IP configured)
      if (serverIp) {
        const { error: vpsError } = await supabase.functions.invoke('install-hft-bot', {
          body: { action: 'start-bot', serverIp }
        });

        if (vpsError) {
          console.error('[BotControl] VPS signal error:', vpsError);
        }
      }

      // 2. Update database
      await supabase.from('trading_config')
        .update({ 
          bot_status: 'running', 
          trading_enabled: true,
          updated_at: new Date().toISOString()
        })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (provider) {
        await supabase.from('vps_config')
          .update({ status: 'running' })
          .eq('provider', provider);
      }

      setBotStatus('running');
      toast.success(testMode ? 'Bot started in TEST MODE (paper trading)' : 'Bot started - LIVE TRADING enabled');
    } catch (error) {
      console.error('[BotControl] Start error:', error);
      toast.error('Failed to start bot');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopBot = async () => {
    setIsStopping(true);
    try {
      // Get active VPS IP dynamically
      const { data: vpsConfig } = await supabase
        .from('vps_config')
        .select('outbound_ip, provider')
        .not('outbound_ip', 'is', null)
        .limit(1)
        .single();

      const serverIp = vpsConfig?.outbound_ip;
      const provider = vpsConfig?.provider;

      // 1. Signal VPS to stop (if IP configured)
      if (serverIp) {
        const { error: vpsError } = await supabase.functions.invoke('install-hft-bot', {
          body: { action: 'stop-bot', serverIp }
        });

        if (vpsError) {
          console.error('[BotControl] VPS signal error:', vpsError);
        }
      }

      // 2. Update database
      await supabase.from('trading_config')
        .update({ 
          bot_status: 'stopped', 
          trading_enabled: false,
          updated_at: new Date().toISOString()
        })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (provider) {
        await supabase.from('vps_config')
          .update({ status: 'idle' })
          .eq('provider', provider);
      }

      setBotStatus('stopped');
      toast.success('Bot stopped successfully');
    } catch (error) {
      console.error('[BotControl] Stop error:', error);
      toast.error('Failed to stop bot');
    } finally {
      setIsStopping(false);
    }
  };

  const handleTestModeToggle = async (checked: boolean) => {
    try {
      await supabase.from('trading_config')
        .update({ 
          test_mode: checked,
          updated_at: new Date().toISOString()
        })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      setTestMode(checked);
      toast.success(checked ? 'TEST MODE enabled (paper trading)' : 'LIVE MODE enabled - Real money at risk!');
    } catch (error) {
      toast.error('Failed to update test mode');
    }
  };

  const getStatusBadge = () => {
    switch (botStatus) {
      case 'running':
        return (
          <Badge className="bg-success/20 text-success border-success/40 gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            RUNNING
          </Badge>
        );
      case 'stopped':
        return (
          <Badge className="bg-destructive/20 text-destructive border-destructive/40">
            STOPPED
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

  if (isLoading) {
    return (
      <div className="glass-card p-4 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Status Section */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Bot Status:</span>
            {getStatusBadge()}
          </div>
          
          {testMode && (
            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/40 gap-1">
              <FlaskConical className="w-3 h-3" />
              TEST MODE
            </Badge>
          )}
        </div>

        {/* Controls Section */}
        <div className="flex items-center gap-4">
          {/* Sync Balances Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncBalances}
            disabled={isSyncing}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            Sync
          </Button>
          
          {/* Test Mode Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Test Mode:</span>
            <Switch 
              checked={testMode} 
              onCheckedChange={handleTestModeToggle}
              disabled={botStatus === 'running'}
            />
          </div>

          {/* Start/Stop Buttons */}
          {botStatus === 'running' ? (
            <Button 
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
            </Button>
          ) : (
            <Button 
              onClick={handleStartBot}
              disabled={isStarting}
              className={`gap-2 ${!testMode ? 'bg-destructive hover:bg-destructive/90' : 'bg-success hover:bg-success/90'}`}
            >
              {isStarting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {!testMode && <AlertTriangle className="w-4 h-4" />}
              START BOT
            </Button>
          )}
        </div>
      </div>

      {!testMode && botStatus !== 'running' && (
        <div className="mt-3 p-2 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <span className="text-sm text-destructive">
            WARNING: Test mode is OFF. Starting the bot will execute REAL trades with your $2,956.79 equity.
          </span>
        </div>
      )}
    </div>
  );
}
