import { Cpu, HardDrive, Clock, Activity, Server, Wifi, WifiOff } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface VPSMetrics {
  uptime?: number;
  memory?: {
    total: number;
    free: number;
    used: number;
    percent: number;
  };
  cpu?: number[];
  hostname?: string;
  platform?: string;
  version?: string;
}

interface VPSHealthDisplayProps {
  status: 'ok' | 'error' | 'down' | 'checking';
  latency: number;
  metrics?: VPSMetrics;
  error?: string;
  hint?: string;
}

export function VPSHealthDisplay({ status, latency, metrics, error, hint }: VPSHealthDisplayProps) {
  const formatUptime = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const avgCpu = metrics?.cpu ? (metrics.cpu.reduce((a, b) => a + b, 0) / metrics.cpu.length * 100).toFixed(1) : null;

  if (status === 'down' || status === 'error') {
    return (
      <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 space-y-3">
        <div className="flex items-center gap-2">
          <WifiOff className="w-5 h-5 text-destructive" />
          <span className="font-semibold text-destructive">Health Endpoint Unreachable</span>
        </div>
        {error && (
          <p className="text-sm text-destructive/80">{error}</p>
        )}
        {hint && (
          <div className="p-3 rounded bg-muted/50 text-xs font-mono break-all">
            {hint}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>Response time: {latency}ms</span>
        </div>
      </div>
    );
  }

  if (status === 'checking') {
    return (
      <div className="p-4 rounded-lg bg-muted/30 border border-muted animate-pulse">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 animate-pulse" />
          <span>Checking health endpoint...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wifi className="w-5 h-5 text-green-500" />
          <span className="font-semibold text-green-500">HFT Bot Online</span>
        </div>
        <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500/50">
          {latency}ms
        </Badge>
      </div>

      {/* Metrics Grid */}
      {metrics && (
        <div className="grid grid-cols-2 gap-4">
          {/* CPU */}
          {avgCpu && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-muted-foreground" />
                  <span>CPU</span>
                </div>
                <span className="font-mono">{avgCpu}%</span>
              </div>
              <Progress value={parseFloat(avgCpu)} className="h-2" />
            </div>
          )}

          {/* Memory */}
          {metrics.memory && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-muted-foreground" />
                  <span>RAM</span>
                </div>
                <span className="font-mono">{metrics.memory.percent.toFixed(1)}%</span>
              </div>
              <Progress value={metrics.memory.percent} className="h-2" />
            </div>
          )}

          {/* Uptime */}
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">Uptime:</span>
            <span className="font-mono text-sm">{formatUptime(metrics.uptime)}</span>
          </div>

          {/* Version */}
          {metrics.version && (
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Version:</span>
              <span className="font-mono text-sm">v{metrics.version}</span>
            </div>
          )}
        </div>
      )}

      {/* Hostname */}
      {metrics?.hostname && (
        <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
          {metrics.hostname} • {metrics.platform}
        </div>
      )}
    </div>
  );
}
