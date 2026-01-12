import * as React from 'react';
import { cn } from '@/lib/utils';

export type StatusDotColor = 'success' | 'warning' | 'destructive' | 'muted' | 'cyan' | 'orange' | 'purple';

interface StatusDotProps {
  color: StatusDotColor;
  pulse?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

/**
 * EXPLICIT COLOR MAPPINGS - Never use CSS variables for status dots.
 * These are raw Tailwind colors that work identically in light and dark themes.
 */
const colorClasses: Record<StatusDotColor, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  destructive: 'bg-red-500',
  muted: 'bg-slate-400',
  cyan: 'bg-cyan-500',
  orange: 'bg-orange-500',
  purple: 'bg-purple-500',
};

const sizeClasses: Record<'xs' | 'sm' | 'md', string> = {
  xs: 'w-1.5 h-1.5',
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
};

/**
 * StatusDot - A small pulsing dot indicator for connection/health status
 * 
 * STRICT RULE: Only this small dot should pulse, NOT the entire card or container.
 * This component is the standardized way to show status indicators across the app.
 * 
 * Colors use explicit Tailwind classes (emerald-500, amber-500, red-500) to ensure
 * consistent appearance regardless of theme.
 * 
 * Uses forwardRef to support Radix UI components (e.g., TooltipTrigger asChild).
 */
export const StatusDot = React.forwardRef<HTMLSpanElement, StatusDotProps>(
  ({ color, pulse = false, size = 'sm', className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-block rounded-full flex-shrink-0',
          sizeClasses[size],
          colorClasses[color],
          pulse && 'animate-pulse',
          className
        )}
        {...props}
      />
    );
  }
);

StatusDot.displayName = 'StatusDot';
