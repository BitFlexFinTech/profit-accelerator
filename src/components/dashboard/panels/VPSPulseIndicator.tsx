import { cn } from '@/lib/utils';
import { StatusDot, type StatusDotColor } from '@/components/ui/StatusDot';

export type PulseStatus = 'running' | 'initializing' | 'stopped' | 'unknown';

interface VPSPulseIndicatorProps {
  status: PulseStatus;
  latencyMs?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

/**
 * Maps PulseStatus to StatusDot color - using explicit colors
 */
const STATUS_CONFIG: Record<PulseStatus, { color: StatusDotColor; label: string }> = {
  running: { color: 'success', label: 'Running' },
  initializing: { color: 'warning', label: 'Initializing' },
  stopped: { color: 'destructive', label: 'Stopped' },
  unknown: { color: 'muted', label: 'Unknown' },
};

const SIZE_CONFIG = {
  sm: { dotSize: 'xs' as const, text: 'text-[10px]' },
  md: { dotSize: 'sm' as const, text: 'text-xs' },
  lg: { dotSize: 'md' as const, text: 'text-sm' },
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

/**
 * VPSPulseIndicator - Shows VPS status with a small pulsing dot
 * STRICT RULE: Only the StatusDot pulses, not the container
 */
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
  const shouldPulse = effectiveStatus === 'running' || effectiveStatus === 'initializing';

  return (
    <div className="flex items-center gap-1.5">
      <StatusDot 
        color={config.color} 
        size={sizeConfig.dotSize} 
        pulse={shouldPulse}
      />
      {showLabel && (
        <span className={cn("font-medium", sizeConfig.text)}>
          {config.label}
        </span>
      )}
    </div>
  );
}

/**
 * VPSStatusBadge - Badge with status indicator
 * STRICT RULE: Only the StatusDot pulses, the badge itself does NOT animate
 */
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
  const shouldPulse = status === 'running' || status === 'initializing';
  
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
        status === 'running' && "bg-emerald-500/10 text-emerald-400",
        status === 'initializing' && "bg-amber-500/10 text-amber-400",
        status === 'stopped' && "bg-red-500/10 text-red-400",
        status === 'unknown' && "bg-slate-500/10 text-slate-400",
        className
      )}
    >
      <StatusDot color={config.color} size="xs" pulse={shouldPulse} />
      <span>{config.label}</span>
      {latencyMs !== undefined && latencyMs > 0 && (
        <span className="text-muted-foreground ml-1">
          {latencyMs}ms
        </span>
      )}
    </div>
  );
}
