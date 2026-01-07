import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCloudInfrastructure, PROVIDER_ICONS } from '@/hooks/useCloudInfrastructure';
import { Activity, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function MeshHealthScoreWidget() {
  const { providers, meshHealthScore, isConnected, isLoading, refresh } = useCloudInfrastructure();

  const healthyCount = providers.filter(
    p => (p.status === 'running' || p.status === 'idle') && p.consecutive_failures < 3
  ).length;
  const warningCount = providers.filter(
    p => p.consecutive_failures >= 1 && p.consecutive_failures < 3
  ).length;
  const enabledCount = providers.filter(p => p.is_enabled).length;

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-destructive';
  };

  const getHealthLabel = (score: number) => {
    if (score >= 80) return 'HEALTHY';
    if (score >= 50) return 'DEGRADED';
    return 'CRITICAL';
  };

  const getHealthBg = (score: number) => {
    if (score >= 80) return 'from-success/20 to-success/5';
    if (score >= 50) return 'from-warning/20 to-warning/5';
    return 'from-destructive/20 to-destructive/5';
  };

  const getProviderStatus = (provider: typeof providers[0]) => {
    if (provider.consecutive_failures >= 3) return 'down';
    if (provider.status === 'running' || provider.status === 'idle') return 'healthy';
    if (provider.status === 'deploying') return 'deploying';
    return 'inactive';
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-success';
      case 'deploying': return 'bg-warning animate-pulse';
      case 'down': return 'bg-destructive';
      default: return 'bg-muted-foreground/30';
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6 bg-card/50 border-border/50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity className="h-5 w-5 animate-pulse" />
          <span>Loading mesh health...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "p-6 bg-gradient-to-br border-border/50",
      getHealthBg(meshHealthScore)
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Mesh Health Score</h3>
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
        <Button variant="ghost" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Main Score Display */}
      <div className="flex items-center justify-center mb-6">
        <div className="relative">
          {/* Circular Progress Background */}
          <svg className="w-32 h-32 transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              className="text-muted/30"
            />
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              strokeDasharray={`${(meshHealthScore / 100) * 352} 352`}
              strokeLinecap="round"
              className={getHealthColor(meshHealthScore)}
            />
          </svg>
          {/* Score Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-3xl font-bold", getHealthColor(meshHealthScore))}>
              {meshHealthScore}%
            </span>
            <span className={cn("text-xs font-medium", getHealthColor(meshHealthScore))}>
              {getHealthLabel(meshHealthScore)}
            </span>
          </div>
        </div>
      </div>

      {/* Provider Status Grid */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {providers.filter(p => p.is_enabled).slice(0, 8).map(provider => {
          const status = getProviderStatus(provider);
          return (
            <div
              key={provider.provider}
              className="flex flex-col items-center gap-1 p-2 rounded-lg bg-background/50"
              title={`${provider.provider}: ${status}`}
            >
              <span className="text-lg">{PROVIDER_ICONS[provider.provider] || '🖥️'}</span>
              <div className={cn("w-2 h-2 rounded-full", getStatusDot(status))} />
            </div>
          );
        })}
      </div>

      {/* Summary Stats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/50">
        <span>{healthyCount}/{enabledCount} providers healthy</span>
        {warningCount > 0 && (
          <span className="text-warning">{warningCount} warnings</span>
        )}
      </div>
    </Card>
  );
}
