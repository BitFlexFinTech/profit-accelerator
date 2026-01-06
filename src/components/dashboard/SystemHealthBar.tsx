import { Brain, Activity, Server } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { cn } from '@/lib/utils';

interface SystemHealthBarProps {
  onNavigateToSettings?: () => void;
}

export function SystemHealthBar({ onNavigateToSettings }: SystemHealthBarProps) {
  const status = useSystemStatus();

  const indicators = [
    {
      id: 'ai',
      label: 'AI',
      icon: Brain,
      isActive: status.ai.isActive,
      tooltip: status.ai.isActive 
        ? `Active: ${status.ai.model || 'Groq'}` 
        : 'AI not configured',
    },
    {
      id: 'exchanges',
      label: `${status.exchanges.connected}/${status.exchanges.total}`,
      icon: Activity,
      isActive: status.exchanges.connected > 0,
      tooltip: status.exchanges.connected > 0
        ? `$${status.exchanges.balanceUsdt.toLocaleString()} USDT`
        : 'No exchanges connected',
    },
    {
      id: 'vps',
      label: 'VPS',
      icon: Server,
      isActive: status.vps.status === 'running',
      tooltip: status.vps.status === 'running'
        ? `Tokyo (${status.vps.ip || 'IP pending'})`
        : 'VPS inactive',
    },
  ];

  if (status.isLoading) {
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
        {indicators.map((indicator) => (
          <Tooltip key={indicator.id}>
            <TooltipTrigger asChild>
              <button
                onClick={onNavigateToSettings}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                  'border hover:scale-105 active:scale-95',
                  indicator.isActive
                    ? 'bg-primary/20 border-primary/40 text-primary'
                    : 'bg-muted/50 border-border text-muted-foreground'
                )}
              >
                <span className="relative flex h-2 w-2">
                  {indicator.isActive && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  )}
                  <span
                    className={cn(
                      'relative inline-flex rounded-full h-2 w-2',
                      indicator.isActive ? 'bg-primary' : 'bg-muted-foreground/50'
                    )}
                  />
                </span>
                <indicator.icon className="h-3 w-3" />
                <span className="hidden sm:inline">{indicator.label}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {indicator.tooltip}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
