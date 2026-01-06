import { useMemo } from 'react';

interface VPSHealthGaugeProps {
  label: string;
  value: number;
  max: number;
  unit: string;
  thresholds: {
    warning: number;
    critical: number;
  };
}

export function VPSHealthGauge({ label, value, max, unit, thresholds }: VPSHealthGaugeProps) {
  const percentage = Math.min((value / max) * 100, 100);
  
  const status = useMemo(() => {
    if (value >= thresholds.critical) return 'critical';
    if (value >= thresholds.warning) return 'warning';
    return 'healthy';
  }, [value, thresholds]);

  const getColor = () => {
    switch (status) {
      case 'critical': return 'text-destructive';
      case 'warning': return 'text-warning';
      default: return 'text-success';
    }
  };

  const getGradient = () => {
    switch (status) {
      case 'critical': return 'from-destructive/20 to-destructive/5';
      case 'warning': return 'from-warning/20 to-warning/5';
      default: return 'from-success/20 to-success/5';
    }
  };

  const getBarColor = () => {
    switch (status) {
      case 'critical': return 'bg-destructive';
      case 'warning': return 'bg-warning';
      default: return 'bg-success';
    }
  };

  return (
    <div className={`p-3 rounded-lg bg-gradient-to-b ${getGradient()}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`text-sm font-mono font-bold ${getColor()}`}>
          {value}{unit}
        </span>
      </div>
      
      {/* Progress Bar */}
      <div className="h-1.5 bg-secondary/50 rounded-full overflow-hidden">
        <div 
          className={`h-full ${getBarColor()} transition-all duration-500 rounded-full`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      {/* Threshold markers */}
      <div className="relative h-1 mt-1">
        <div 
          className="absolute w-px h-2 bg-warning/50 -top-0.5"
          style={{ left: `${(thresholds.warning / max) * 100}%` }}
        />
        <div 
          className="absolute w-px h-2 bg-destructive/50 -top-0.5"
          style={{ left: `${(thresholds.critical / max) * 100}%` }}
        />
      </div>
    </div>
  );
}