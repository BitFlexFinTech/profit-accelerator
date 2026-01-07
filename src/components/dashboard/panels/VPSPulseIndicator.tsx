import { cn } from '@/lib/utils';

export type PulseStatus = 'running' | 'initializing' | 'stopped' | 'unknown';

interface VPSPulseIndicatorProps {
  status: PulseStatus;
  latencyMs?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const STATUS_CONFIG = {
  running: {
    color: 'bg-success',
    pulseClass: 'pulse-success',
    label: 'Running',
    ringColor: 'ring-success/30',
  },
  initializing: {
    color: 'bg-warning',
    pulseClass: 'pulse-warning',
    label: 'Initializing',
    ringColor: 'ring-warning/30',
  },
  stopped: {
    color: 'bg-destructive',
    pulseClass: 'pulse-danger',
    label: 'Stopped',
    ringColor: 'ring-destructive/30',
  },
  unknown: {
    color: 'bg-muted-foreground',
    pulseClass: '',
    label: 'Unknown',
    ringColor: 'ring-muted-foreground/30',
  },
};

const SIZE_CONFIG = {
  sm: {
    dot: 'w-2 h-2',
    wrapper: 'w-3 h-3',
    text: 'text-[10px]',
  },
  md: {
    dot: 'w-3 h-3',
    wrapper: 'w-4 h-4',
    text: 'text-xs',
  },
  lg: {
    dot: 'w-4 h-4',
    wrapper: 'w-5 h-5',
    text: 'text-sm',
  },
};

export function getStatusFromVPS(
  vpsStatus: string | null,
  latencyMs?: number,
  consecutiveFailures?: number
): PulseStatus {
  // If too many failures, mark as stopped
  if (consecutiveFailures && consecutiveFailures >= 3) return 'stopped';
  
  // Map database status to pulse status
  switch (vpsStatus) {
    case 'running':
      return latencyMs && latencyMs > 2000 ? 'initializing' : 'running';
    case 'deploying':
    case 'starting':
    case 'pending':
    case 'idle':
      return 'initializing';
    case 'stopped':
    case 'failed':
    case 'error':
      return 'stopped';
    case 'not_configured':
    default:
      return 'unknown';
  }
}

export function VPSPulseIndicator({
  status,
  latencyMs,
  size = 'md',
  showLabel = false,
}: VPSPulseIndicatorProps) {
  // Override status based on latency if available
  let effectiveStatus = status;
  if (latencyMs !== undefined) {
    if (latencyMs > 2000 && status === 'running') {
      effectiveStatus = 'initializing';
    } else if (latencyMs < 0 || latencyMs > 5000) {
      effectiveStatus = 'stopped';
    }
  }

  const config = STATUS_CONFIG[effectiveStatus];
  const sizeConfig = SIZE_CONFIG[size];

  return (
    <div className="flex items-center gap-1.5">
      <div 
        className={cn(
          "relative flex items-center justify-center rounded-full",
          sizeConfig.wrapper
        )}
      >
        <div
          className={cn(
            "absolute inset-0 rounded-full",
            config.color,
            config.pulseClass && `${config.pulseClass}`
          )}
        />
        <div
          className={cn(
            "relative rounded-full",
            config.color,
            sizeConfig.dot
          )}
        />
      </div>
      {showLabel && (
        <span className={cn("font-medium", sizeConfig.text)}>
          {config.label}
        </span>
      )}
    </div>
  );
}

export function VPSStatusBadge({
  status,
  latencyMs,
  className,
}: {
  status: PulseStatus;
  latencyMs?: number;
  className?: string;
}) {
  const config = STATUS_CONFIG[status];
  
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
        status === 'running' && "bg-success/10 text-success",
        status === 'initializing' && "bg-warning/10 text-warning",
        status === 'stopped' && "bg-destructive/10 text-destructive",
        status === 'unknown' && "bg-muted text-muted-foreground",
        className
      )}
    >
      <VPSPulseIndicator status={status} latencyMs={latencyMs} size="sm" />
      <span>{config.label}</span>
      {latencyMs !== undefined && latencyMs > 0 && (
        <span className="text-muted-foreground ml-1">
          {latencyMs}ms
        </span>
      )}
    </div>
  );
}
