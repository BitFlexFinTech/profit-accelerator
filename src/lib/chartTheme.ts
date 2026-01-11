/**
 * Shared Chart Theme - System-wide styling for all Recharts components
 * Based on reference images: dark background, vibrant flat colors, glass-card chrome
 */

// Chart color palette - vibrant flat colors
export const CHART_COLORS = {
  // Primary data colors
  primary: '#00D9FF',      // Cyan
  secondary: '#A855F7',    // Purple
  success: '#22C55E',      // Green
  warning: '#F59E0B',      // Amber
  danger: '#EF4444',       // Red
  
  // Multi-series colors
  series: [
    '#00D9FF',  // Cyan
    '#A855F7',  // Purple
    '#22C55E',  // Green
    '#F59E0B',  // Amber
    '#EC4899',  // Pink
    '#3B82F6',  // Blue
  ],
  
  // Grid and axis
  grid: 'rgba(255, 255, 255, 0.06)',
  axis: 'rgba(255, 255, 255, 0.4)',
  axisLabel: 'rgba(255, 255, 255, 0.6)',
  
  // Tooltip
  tooltipBg: 'rgba(15, 23, 42, 0.95)',
  tooltipBorder: 'rgba(255, 255, 255, 0.1)',
  tooltipText: '#FFFFFF',
};

// Shared Recharts component styles
export const chartStyles = {
  // CartesianGrid props
  grid: {
    strokeDasharray: '3 3',
    stroke: CHART_COLORS.grid,
    opacity: 0.5,
  },
  
  // XAxis props
  xAxis: {
    stroke: CHART_COLORS.axis,
    strokeWidth: 1,
    axisLine: false,
    tickLine: false,
  },
  
  // YAxis props
  yAxis: {
    stroke: CHART_COLORS.axis,
    strokeWidth: 1,
    axisLine: false,
    tickLine: false,
  },
  
  // Axis tick props
  tick: {
    fill: CHART_COLORS.axisLabel,
    fontSize: 12,
  },
  
  // Tooltip props
  tooltip: {
    contentStyle: {
      backgroundColor: CHART_COLORS.tooltipBg,
      border: `1px solid ${CHART_COLORS.tooltipBorder}`,
      borderRadius: '8px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    },
    labelStyle: {
      color: CHART_COLORS.tooltipText,
      fontWeight: 600,
      marginBottom: 4,
    },
    itemStyle: {
      color: CHART_COLORS.tooltipText,
    },
  },
  
  // Line chart specific
  line: {
    strokeWidth: 2,
    dot: { r: 2 },
    activeDot: { r: 4, strokeWidth: 0 },
  },
  
  // Bar chart specific
  bar: {
    radius: [4, 4, 0, 0] as [number, number, number, number],
  },
  
  // Area chart specific
  area: {
    strokeWidth: 2,
    fillOpacity: 0.15,
  },
};

// Status color mapping for consistency
export const STATUS_COLORS = {
  healthy: '#22C55E',    // Emerald-500
  warning: '#F59E0B',    // Amber-500
  error: '#EF4444',      // Red-500
  offline: '#64748B',    // Slate-500
  unknown: '#64748B',    // Slate-500
  
  // For latency thresholds
  fast: '#22C55E',       // < 30ms
  medium: '#F59E0B',     // 30-80ms
  slow: '#EF4444',       // > 80ms
};

// Helper to get latency color
export function getLatencyColor(ms: number): string {
  if (ms < 30) return STATUS_COLORS.fast;
  if (ms < 80) return STATUS_COLORS.medium;
  return STATUS_COLORS.slow;
}

// Helper to get percentage color (for success rates, etc.)
export function getPercentageColor(percent: number): string {
  if (percent >= 90) return STATUS_COLORS.healthy;
  if (percent >= 70) return STATUS_COLORS.warning;
  return STATUS_COLORS.error;
}
