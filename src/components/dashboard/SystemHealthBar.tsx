import { useState, useEffect, useRef, forwardRef, ComponentPropsWithoutRef } from 'react';
import { Brain, Activity, Server, Loader2, RefreshCw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { ResetDataButton } from './ResetDataButton';

// Forward ref button component for tooltip compatibility
const IndicatorButton = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<'button'>>(
  (props, ref) => <button ref={ref} {...props} />
);
IndicatorButton.displayName = 'IndicatorButton';

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
  const hasError = status.vps.botStatus === 'error' || botStatus === 'error';

  // Determine VPS connection state: 'connected' (green) | 'warning' (yellow) | 'disconnected' (red)
  const getVpsColorState = (): 'connected' | 'warning' | 'disconnected' => {
    // Red: Error state or no IP with inactive status
    if (hasError) return 'disconnected';
    if (status.vps.status === 'error' || status.vps.status === 'failed') return 'disconnected';
    if (!status.vps.ip && status.vps.status === 'inactive') return 'disconnected';
    
    // Yellow: Deploying, starting, or unknown states
    if (status.vps.status === 'deploying' || status.vps.status === 'starting') return 'warning';
    
    // Green: Running with a valid IP (regardless of bot_status)
    if (status.vps.status === 'running' && status.vps.ip) return 'connected';
    if (status.vps.ip && status.vps.healthStatus === 'healthy') return 'connected';
    if (status.vps.ip) return 'connected'; // Has IP = connected
    
    return 'warning'; // Default to warning for unknown states
  };

  const vpsColorState = getVpsColorState();

  const getVpsTooltip = () => {
    if (hasError) {
      return 'VPS Error - Clear error in Bot Control panel';
    }
    if (isReadyForSetup) {
      return 'Ready for Setup - Configure VPS in Settings';
    }
    if (vpsColorState === 'connected' && status.vps.ip) {
      const provider = status.vps.provider 
        ? `${status.vps.provider.charAt(0).toUpperCase()}${status.vps.provider.slice(1)}` 
        : '';
      const botInfo = status.vps.botStatus === 'running' ? ' • Bot Running' : 
                      status.vps.botStatus === 'stopped' ? ' • Bot Stopped' : '';
      return `Connected - ${status.vps.ip}${provider ? ` (${provider})` : ''}${botInfo}`;
    }
    if (status.vps.status === 'deploying') {
      return 'Deploying instance...';
    }
    if (vpsColorState === 'warning') {
      return 'VPS starting...';
    }
    return 'VPS not connected';
  };

  const indicators = [
    {
      id: 'ai',
      label: 'AI',
      icon: Brain,
      isActive: status.ai.isActive,
      isDeploying: false,
      colorState: status.ai.isActive ? 'connected' : 'disconnected',
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
      colorState: status.exchanges.connected > 0 ? 'connected' : 'disconnected',
      tooltip: status.exchanges.connected > 0
        ? `$${status.exchanges.balanceUsdt.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT`
        : 'No exchanges connected',
    },
    {
      id: 'vps',
      label: 'VPS',
      icon: Server,
      isActive: vpsColorState === 'connected',
      isDeploying: isDeploying,
      colorState: vpsColorState,
      tooltip: getVpsTooltip(),
    },
  ] as const;

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
          const colorState = indicator.colorState;
          
          // Determine colors based on state
          const bgClass = colorState === 'connected' 
            ? 'bg-success/20 border-success/40 text-success'
            : colorState === 'warning' || indicator.isDeploying
            ? 'bg-warning/20 border-warning/40 text-warning'
            : 'bg-muted/50 border-border text-muted-foreground';

          const dotColor = colorState === 'connected'
            ? 'bg-success'
            : colorState === 'warning' || indicator.isDeploying
            ? 'bg-warning'
            : 'bg-muted-foreground/50';

          const pingColor = colorState === 'connected'
            ? 'bg-success'
            : colorState === 'warning' || indicator.isDeploying
            ? 'bg-warning'
            : '';
          
          return (
            <Tooltip key={indicator.id}>
              <TooltipTrigger asChild>
                <IndicatorButton
                  onClick={onNavigateToSettings}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                    'border hover:scale-105 active:scale-95',
                    bgClass,
                    isFlashing && 'animate-pulse ring-2 ring-primary/50'
                  )}
                >
                  <span className="relative flex h-2 w-2">
                    {(colorState === 'connected' || colorState === 'warning' || indicator.isDeploying) && (
                      <span className={cn(
                        'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                        pingColor
                      )} />
                    )}
                    <span className={cn('relative inline-flex rounded-full h-2 w-2', dotColor)} />
                  </span>
                  {indicator.isDeploying ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <indicator.icon className="h-3 w-3" />
                  )}
                  <span className="hidden sm:inline">{indicator.label}</span>
                </IndicatorButton>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {indicator.tooltip}
              </TooltipContent>
            </Tooltip>
          );
        })}
        
        <Tooltip>
          <TooltipTrigger asChild>
            <IndicatorButton
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={cn(
                'flex items-center justify-center h-7 w-7 rounded-full text-xs transition-all',
                'border hover:scale-105 active:scale-95',
                'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
              )}
            >
              <RefreshCw className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
            </IndicatorButton>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Refresh health status
          </TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <ResetDataButton variant="compact" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Reset all trading data
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
