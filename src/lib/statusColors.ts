/**
 * Centralized Status Color Mapping
 * STRICT RULE: All status dots must use these explicit Tailwind colors
 * Never use CSS variables for status indicators
 */

import type { StatusDotColor } from '@/components/ui/StatusDot';

// Map common status strings to StatusDot colors
export function getStatusDotColor(status: string | null | undefined): StatusDotColor {
  if (!status) return 'muted';
  
  const normalized = status.toLowerCase().trim();
  
  // Success states
  if (['running', 'active', 'healthy', 'connected', 'online', 'success', 'ok', 'ready', 'live', 'green', 'configured', 'validated'].includes(normalized)) {
    return 'success';
  }
  
  // Warning states
  if (['warning', 'jitter', 'pending', 'deploying', 'provisioning', 'initializing', 'stale', 'yellow', 'slow'].includes(normalized)) {
    return 'warning';
  }
  
  // Error/destructive states
  if (['error', 'failed', 'disconnected', 'offline', 'stopped', 'red', 'critical', 'down'].includes(normalized)) {
    return 'destructive';
  }
  
  // Neutral/unknown states
  return 'muted';
}

// Map exchange pulse status to colors
export function getExchangePulseColor(status: string | null): StatusDotColor {
  switch (status) {
    case 'healthy':
    case 'green':
      return 'success';
    case 'jitter':
    case 'yellow':
      return 'warning';
    case 'error':
    case 'red':
      return 'destructive';
    default:
      return 'muted';
  }
}

// Map VPS status to colors
export function getVpsStatusColor(status: string | null): StatusDotColor {
  switch (status) {
    case 'running':
    case 'active':
    case 'healthy':
      return 'success';
    case 'deploying':
    case 'provisioning':
    case 'warning':
      return 'warning';
    case 'stopped':
    case 'error':
    case 'offline':
      return 'destructive';
    default:
      return 'muted';
  }
}

// Map cloud provider status to colors
export function getCloudStatusColor(status: string | null, isActive: boolean): StatusDotColor {
  if (isActive && (status === 'running' || status === 'active')) {
    return 'success';
  }
  if (status === 'configured' || status === 'validated') {
    return 'cyan';
  }
  if (status === 'deploying' || status === 'pending') {
    return 'warning';
  }
  if (status === 'error' || status === 'failed') {
    return 'destructive';
  }
  return 'muted';
}

// Map connection status (live/stale/offline) to colors
export function getConnectionStatusColor(isLive: boolean, isStale: boolean): StatusDotColor {
  if (isLive) return 'success';
  if (isStale) return 'warning';
  return 'muted';
}

// Map AI provider status to colors
export function getAIProviderStatusColor(hasValidKey: boolean, isEnabled: boolean, atRateLimit: boolean): StatusDotColor {
  if (!hasValidKey) return 'muted';
  if (atRateLimit) return 'warning';
  if (isEnabled) return 'success';
  return 'destructive';
}

// Explicit Tailwind class mapping for direct usage (when StatusDot can't be used)
export const STATUS_BG_CLASSES = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  destructive: 'bg-red-500',
  muted: 'bg-slate-400',
  cyan: 'bg-cyan-500',
  orange: 'bg-orange-500',
  purple: 'bg-purple-500',
} as const;
