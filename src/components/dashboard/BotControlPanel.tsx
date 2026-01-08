import { useState, useEffect } from 'react';
import { Play, Square, AlertTriangle, Loader2, RefreshCw, FlaskConical, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useExchangeWebSocket } from '@/hooks/useExchangeWebSocket';
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

type BotStatus = 'idle' | 'running' | 'stopped';

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
  const paperTradingMode = useAppStore(state => state.paperTradingMode);
  const togglePaperTrading = useAppStore(state => state.togglePaperTrading);

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
        .single();

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
      const { data: vpsConfig } = await supabase
        .from('vps_config')
        .select('outbound_ip, provider')
        .not('outbound_ip', 'is', null)
        .limit(1)
        .single();

      const serverIp = vpsConfig?.outbound_ip;
      const provider = vpsConfig?.provider;

      if (serverIp) {
        const { error: vpsError } = await supabase.functions.invoke('install-hft-bot', {
          body: { action: 'start-bot', serverIp }
        });

        if (vpsError) {
          console.error('[BotControl] VPS signal error:', vpsError);
        }
      }

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
      toast.success('Bot started - LIVE TRADING enabled');
    } catch (error) {
      console.error('[BotControl] Start error:', error);
      toast.error('Failed to start bot');
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
      const { data: vpsConfig } = await supabase
        .from('vps_config')
        .select('outbound_ip, provider')
        .not('outbound_ip', 'is', null)
        .limit(1)
        .single();

      const serverIp = vpsConfig?.outbound_ip;
      const provider = vpsConfig?.provider;

      if (serverIp) {
        const { error: vpsError } = await supabase.functions.invoke('install-hft-bot', {
          body: { action: 'stop-bot', serverIp }
        });

        if (vpsError) {
          console.error('[BotControl] VPS signal error:', vpsError);
        }
      }

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
          </div>

          <div className="flex items-center gap-3">
            {/* Paper Trading Toggle */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border">
              <FlaskConical className={`w-4 h-4 ${paperTradingMode ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-xs font-medium ${paperTradingMode ? 'text-primary' : 'text-muted-foreground'}`}>Paper</span>
              <Switch 
                checked={!paperTradingMode} 
                onCheckedChange={() => togglePaperTrading()}
                className="data-[state=checked]:bg-destructive"
              />
              <Zap className={`w-4 h-4 ${!paperTradingMode ? 'text-destructive' : 'text-muted-foreground'}`} />
              <span className={`text-xs font-medium ${!paperTradingMode ? 'text-destructive' : 'text-muted-foreground'}`}>Live</span>
            </div>

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
              </Button>
            )}
          </div>
        </div>

        {/* Paper Trading Active Banner */}
        {paperTradingMode && (
          <div className="mt-3 p-2 rounded-lg bg-primary/10 border border-primary/30 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary font-medium">
              Paper Trading Mode - No real orders will be executed
            </span>
          </div>
        )}

        {/* Live Mode Warning */}
        {botStatus !== 'running' && !paperTradingMode && (
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
