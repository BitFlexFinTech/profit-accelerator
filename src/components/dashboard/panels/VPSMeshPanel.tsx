import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Server, 
  Activity, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  ArrowRight,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Globe
} from 'lucide-react';
import { useRealtimeMesh } from '@/hooks/useRealtimeMesh';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const PROVIDER_ICONS: Record<string, string> = {
  contabo: '🌏',
  vultr: '🦅',
  aws: '☁️',
  digitalocean: '🌊',
  gcp: '🔵',
  oracle: '🔴',
  alibaba: '🟠',
  azure: '💠',
};

const PROVIDER_REGIONS: Record<string, string> = {
  contabo: 'Singapore',
  vultr: 'Tokyo NRT',
  aws: 'Tokyo ap-northeast-1',
  digitalocean: 'Singapore SGP1',
  gcp: 'Tokyo asia-northeast1',
  oracle: 'Tokyo ap-tokyo-1',
  alibaba: 'Tokyo ap-northeast-1',
  azure: 'Japan East',
};

export function VPSMeshPanel() {
  const { nodes, metrics, activeProvider, lastFailover, isConnected, isLoading, triggerFailover, refresh } = useRealtimeMesh();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [failoverInProgress, setFailoverInProgress] = useState<string | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    refresh();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleFailover = async (toProvider: string) => {
    if (!activeProvider || activeProvider === toProvider) return;
    
    setFailoverInProgress(toProvider);
    const result = await triggerFailover(activeProvider, toProvider);
    
    if (result.success) {
      toast.success(`Failover to ${toProvider} initiated`);
    } else {
      toast.error('Failover failed');
    }
    setFailoverInProgress(null);
  };

  const getStatusColor = (status: string | null, latency?: number, consecutiveFailures?: number) => {
    if (consecutiveFailures && consecutiveFailures >= 3) return 'text-destructive';
    if (status === 'running') return 'text-success';
    if (status === 'idle') return 'text-primary';
    if (status === 'deploying') return 'text-warning';
    if (latency && latency > 150) return 'text-warning';
    return 'text-muted-foreground';
  };

  const getStatusIcon = (status: string | null, consecutiveFailures?: number) => {
    if (consecutiveFailures && consecutiveFailures >= 3) return <WifiOff className="h-4 w-4 text-destructive" />;
    if (status === 'running') return <CheckCircle2 className="h-4 w-4 text-success" />;
    if (status === 'idle') return <Wifi className="h-4 w-4 text-primary" />;
    if (status === 'deploying') return <Activity className="h-4 w-4 text-warning animate-pulse" />;
    return <Server className="h-4 w-4 text-muted-foreground" />;
  };

  const formatLatency = (ms?: number) => {
    if (!ms) return '—';
    if (ms < 50) return `${ms}ms 🚀`;
    if (ms < 100) return `${ms}ms ✓`;
    if (ms < 150) return `${ms}ms`;
    return `${ms}ms ⚠️`;
  };

  if (isLoading) {
    return (
      <Card className="p-6 bg-card/50 border-border/50">
        <div className="flex items-center gap-3 mb-4">
          <Globe className="h-5 w-5 text-primary animate-pulse" />
          <span className="font-semibold">Loading VPS Mesh...</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-card/50 border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Globe className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">VPS Mesh Network</h3>
          <Badge 
            variant="outline" 
            className={cn(
              "text-xs",
              isConnected ? "bg-success/10 text-success border-success/40" : "bg-muted text-muted-foreground"
            )}
          >
            {isConnected ? '● Live' : '○ Connecting...'}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Last Failover Alert */}
      {lastFailover && (
        <div className="mb-4 p-3 rounded-lg bg-warning/10 border border-warning/30 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <div className="flex-1">
            <span className="text-sm">
              Last failover: <strong>{lastFailover.from_provider}</strong> → <strong>{lastFailover.to_provider}</strong>
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              {lastFailover.triggered_at ? new Date(lastFailover.triggered_at).toLocaleString() : ''}
            </span>
          </div>
          <Badge variant="outline" className="text-xs">
            {lastFailover.is_automatic ? 'Auto' : 'Manual'}
          </Badge>
        </div>
      )}

      {/* VPS Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {nodes.map(node => {
          const metric = metrics[node.provider];
          const isPrimary = node.provider === activeProvider;
          const isHealthy = node.status === 'running' || node.status === 'idle';
          
          return (
            <div
              key={node.provider}
              className={cn(
                "relative p-4 rounded-lg border transition-all",
                isPrimary 
                  ? "bg-primary/10 border-primary/50 ring-2 ring-primary/30" 
                  : "bg-secondary/30 border-border/50 hover:border-border",
                failoverInProgress === node.provider && "animate-pulse"
              )}
            >
              {/* Primary Badge */}
              {isPrimary && (
                <div className="absolute -top-2 -right-2">
                  <Badge className="bg-primary text-primary-foreground text-xs px-2 py-0.5">
                    <Zap className="h-3 w-3 mr-1" />
                    ACTIVE
                  </Badge>
                </div>
              )}

              {/* Provider Header */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{PROVIDER_ICONS[node.provider] || '🖥️'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium capitalize truncate">{node.provider}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {PROVIDER_REGIONS[node.provider] || node.region}
                  </p>
                </div>
                {getStatusIcon(node.status, node.consecutive_failures)}
              </div>

              {/* IP Address */}
              {node.outbound_ip && (
                <p className="text-xs font-mono text-muted-foreground mb-2 truncate">
                  {node.outbound_ip}
                </p>
              )}

              {/* Metrics */}
              {metric && (
                <div className="space-y-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-8">CPU</span>
                    <Progress value={metric.cpu_percent || 0} className="h-1.5 flex-1" />
                    <span className="text-xs font-mono w-10 text-right">{metric.cpu_percent || 0}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-8">RAM</span>
                    <Progress value={metric.ram_percent || 0} className="h-1.5 flex-1" />
                    <span className="text-xs font-mono w-10 text-right">{metric.ram_percent || 0}%</span>
                  </div>
                </div>
              )}

              {/* Latency */}
              <div className="flex items-center justify-between text-xs mb-3">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Latency
                </span>
                <span className={cn("font-mono", getStatusColor(node.status, node.latency_ms, node.consecutive_failures))}>
                  {formatLatency(node.latency_ms)}
                </span>
              </div>

              {/* Failover Button */}
              {!isPrimary && isHealthy && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => handleFailover(node.provider)}
                  disabled={!!failoverInProgress}
                >
                  <ArrowRight className="h-3 w-3 mr-1" />
                  Switch to {node.provider}
                </Button>
              )}

              {/* Not Configured State */}
              {node.status === 'not_configured' && (
                <p className="text-xs text-muted-foreground text-center">Not configured</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
        <span>Auto-failover: 150ms threshold for 30s</span>
        <span>{nodes.filter(n => n.status === 'running' || n.status === 'idle').length}/{nodes.length} nodes healthy</span>
      </div>
    </Card>
  );
}
