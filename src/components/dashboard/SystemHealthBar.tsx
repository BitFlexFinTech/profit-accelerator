import { useState, useEffect, useRef } from 'react';
import { Brain, Activity, Server, Loader2, RefreshCw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface SystemHealthBarProps {
  onNavigateToSettings?: () => void;
}

export function SystemHealthBar({ onNavigateToSettings }: SystemHealthBarProps) {
  const { checkHealth, isLoading: statusLoading, ...status } = useSystemStatus();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [flashingIndicators, setFlashingIndicators] = useState<Set<string>>(new Set());
  const [botStatus, setBotStatus] = useState<string>('idle');
  const prevStatusRef = useRef(status);

  // Fetch bot status to control pulse
  useEffect(() => {
    const fetchBotStatus = async () => {
      const { data } = await supabase
        .from('trading_config')
        .select('bot_status')
        .single();
      if (data?.bot_status) {
        setBotStatus(data.bot_status);
      }
    };
    
    fetchBotStatus();
    
    // Subscribe to trading_config changes
    const channel = supabase
      .channel('bot-status-pulse')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trading_config'
      }, (payload) => {
        const newData = payload.new as { bot_status?: string };
        if (newData?.bot_status) {
          setBotStatus(newData.bot_status);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Trigger flash animation on status changes
  useEffect(() => {
    const prev = prevStatusRef.current;
    const newFlashing = new Set<string>();

    if (prev.ai.isActive !== status.ai.isActive) newFlashing.add('ai');
    if (prev.exchanges.connected !== status.exchanges.connected) newFlashing.add('exchanges');
    if (prev.vps.status !== status.vps.status) newFlashing.add('vps');

    if (newFlashing.size > 0) {
      setFlashingIndicators(newFlashing);
      const timer = setTimeout(() => setFlashingIndicators(new Set()), 600);
      return () => clearTimeout(timer);
    }

    prevStatusRef.current = status;
  }, [status]);

  const isDeploying = status.vps.status === 'deploying';
  const isReadyForSetup = !status.vps.ip && botStatus === 'stopped';

  const getVpsTooltip = () => {
    if (isReadyForSetup) {
      return 'Ready for Setup - Configure VPS in Settings';
    }
    if (botStatus === 'running') {
      const provider = status.vps.provider 
        ? `${status.vps.provider.charAt(0).toUpperCase()}${status.vps.provider.slice(1)}` 
        : '';
      return `Running on ${status.vps.ip || 'VPS'}${provider ? ` - ${provider}` : ''}`;
    }
    if (status.vps.status === 'idle' && status.vps.ip) {
      return `Connected (Idle) - ${status.vps.ip}`;
    }
    if (status.vps.status === 'deploying') {
      return 'Deploying instance...';
    }
    return 'VPS inactive';
  };

  // VPS pulse when BOTH vps.status is running AND bot_status is 'running'
  const isVpsActive = status.vps.status === 'running' && botStatus === 'running';
  const isVpsConnected = status.vps.status === 'running' || 
                         (status.vps.status === 'idle' && status.vps.ip);
  
  const indicators = [
    {
      id: 'ai',
      label: 'AI',
      icon: Brain,
      isActive: status.ai.isActive,
      isDeploying: false,
      tooltip: status.ai.isActive 
        ? `Active: ${status.ai.model || 'Groq'}` 
        : 'AI not configured',
    },
    {
      id: 'exchanges',
      label: `${status.exchanges.connected}/${status.exchanges.total}`,
      icon: Activity,
      isActive: status.exchanges.connected > 0,
      isDeploying: false,
      tooltip: status.exchanges.connected > 0
        ? `$${status.exchanges.balanceUsdt.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT`
        : 'No exchanges connected',
    },
    {
      id: 'vps',
      label: 'VPS',
      icon: Server,
      isActive: isVpsActive,
      isConnected: isVpsConnected,
      isDeploying: isDeploying,
      tooltip: getVpsTooltip(),
    },
  ];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await checkHealth();
    setIsRefreshing(false);
  };

  if (statusLoading) {
    return (
      <div className="flex items-center gap-1.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-7 w-14 rounded-full bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex items-center gap-1.5">
        {indicators.map((indicator) => {
          const isFlashing = flashingIndicators.has(indicator.id);
          const isConnectedOnly = 'isConnected' in indicator && indicator.isConnected && !indicator.isActive;
          
          return (
            <Tooltip key={indicator.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={onNavigateToSettings}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                    'border hover:scale-105 active:scale-95',
                    indicator.isActive
                      ? 'bg-primary/20 border-primary/40 text-primary'
                      : indicator.isDeploying
                      ? 'bg-warning/20 border-warning/40 text-warning'
                      : isConnectedOnly
                      ? 'bg-success/10 border-success/40 text-success'
                      : 'bg-muted/50 border-border text-muted-foreground',
                    isFlashing && 'animate-pulse ring-2 ring-primary/50'
                  )}
                >
                  <span className="relative flex h-2 w-2">
                    {indicator.isActive && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    )}
                    {indicator.isDeploying && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
                    )}
                    <span
                      className={cn(
                        'relative inline-flex rounded-full h-2 w-2',
                        indicator.isActive ? 'bg-primary' : 
                        indicator.isDeploying ? 'bg-warning' : 
                        isConnectedOnly ? 'bg-success' :
                        'bg-muted-foreground/50'
                      )}
                    />
                  </span>
                  {indicator.isDeploying ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <indicator.icon className="h-3 w-3" />
                  )}
                  <span className="hidden sm:inline">{indicator.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {indicator.tooltip}
              </TooltipContent>
            </Tooltip>
          );
        })}
        
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={cn(
                'flex items-center justify-center h-7 w-7 rounded-full text-xs transition-all',
                'border hover:scale-105 active:scale-95',
                'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
              )}
            >
              <RefreshCw className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Refresh health status
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
