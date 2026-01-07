import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCloudInfrastructure, PROVIDER_ICONS, PROVIDER_PRICING } from '@/hooks/useCloudInfrastructure';
import { DollarSign, ArrowUpDown, Zap, Play, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type SortKey = 'provider' | 'cost' | 'latency' | 'status' | 'hft_score';
type SortDirection = 'asc' | 'desc';

export function CloudCostComparisonPanel() {
  const { 
    providers, 
    benchmarkResults, 
    bestValueProvider, 
    deployProvider, 
    switchPrimary, 
    runBenchmark 
  } = useCloudInfrastructure();
  
  const [sortKey, setSortKey] = useState<SortKey>('cost');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedProviders = [...providers].sort((a, b) => {
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    
    switch (sortKey) {
      case 'provider':
        return multiplier * a.provider.localeCompare(b.provider);
      case 'cost':
        return multiplier * (a.monthly_cost - b.monthly_cost);
      case 'latency':
        return multiplier * ((a.latency_ms || 999) - (b.latency_ms || 999));
      case 'status':
        return multiplier * a.status.localeCompare(b.status);
      case 'hft_score':
        const aScore = benchmarkResults[a.provider]?.hft_score || 0;
        const bScore = benchmarkResults[b.provider]?.hft_score || 0;
        return multiplier * (bScore - aScore); // Higher is better, so reverse
      default:
        return 0;
    }
  });

  const maxLatency = Math.max(...providers.map(p => p.latency_ms || 0), 150);

  const handleDeploy = async (provider: string) => {
    setLoadingAction(`deploy-${provider}`);
    const result = await deployProvider(provider);
    if (result.success) {
      toast.success(`Deploying ${provider}...`);
    } else {
      toast.error(`Failed to deploy ${provider}`);
    }
    setLoadingAction(null);
  };

  const handleSwitchPrimary = async (provider: string) => {
    setLoadingAction(`switch-${provider}`);
    const result = await switchPrimary(provider);
    if (result.success) {
      toast.success(`Switched primary to ${provider}`);
    } else {
      toast.error(`Failed to switch to ${provider}`);
    }
    setLoadingAction(null);
  };

  const handleRunBenchmark = async (provider: string) => {
    setLoadingAction(`benchmark-${provider}`);
    const result = await runBenchmark(provider);
    if (result.success) {
      toast.success(`Benchmark started for ${provider}`);
    } else {
      toast.error(`Failed to run benchmark for ${provider}`);
    }
    setLoadingAction(null);
  };

  const getStatusBadge = (status: string, isFree: boolean) => {
    if (status === 'running') {
      return <Badge className="bg-success/20 text-success text-xs">Running</Badge>;
    }
    if (status === 'idle') {
      return <Badge className="bg-primary/20 text-primary text-xs">Idle</Badge>;
    }
    if (status === 'deploying') {
      return <Badge className="bg-warning/20 text-warning text-xs animate-pulse">Deploying</Badge>;
    }
    if (isFree) {
      return <Badge variant="outline" className="text-xs">Free Tier</Badge>;
    }
    return <Badge variant="outline" className="text-xs text-muted-foreground">Not Configured</Badge>;
  };

  const SortHeader = ({ label, sortKeyVal }: { label: string; sortKeyVal: SortKey }) => (
    <TableHead 
      className="cursor-pointer hover:text-foreground transition-colors"
      onClick={() => handleSort(sortKeyVal)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={cn(
          "h-3 w-3",
          sortKey === sortKeyVal ? "text-primary" : "text-muted-foreground"
        )} />
      </div>
    </TableHead>
  );

  return (
    <Card className="p-6 bg-card/50 border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-success" />
          <h3 className="font-semibold">Cloud Cost Comparison</h3>
        </div>
        {bestValueProvider && (
          <Badge className="bg-success/20 text-success border-success/40">
            <Zap className="h-3 w-3 mr-1" />
            Best: {bestValueProvider.provider}
          </Badge>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <SortHeader label="Provider" sortKeyVal="provider" />
              <SortHeader label="Monthly Cost" sortKeyVal="cost" />
              <SortHeader label="Latency" sortKeyVal="latency" />
              <SortHeader label="HFT Score" sortKeyVal="hft_score" />
              <SortHeader label="Status" sortKeyVal="status" />
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedProviders.map(provider => {
              const benchmark = benchmarkResults[provider.provider];
              const isBestValue = bestValueProvider?.provider === provider.provider;
              
              return (
                <TableRow 
                  key={provider.provider}
                  className={cn(
                    "transition-colors",
                    isBestValue && "bg-success/5",
                    provider.is_primary && "bg-primary/5"
                  )}
                >
                  {/* Provider */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{PROVIDER_ICONS[provider.provider] || '🖥️'}</span>
                      <div>
                        <p className="font-medium capitalize">{provider.provider}</p>
                        <p className="text-xs text-muted-foreground">{provider.region}</p>
                      </div>
                      {provider.is_primary && (
                        <Badge className="bg-primary/20 text-primary text-xs ml-1">
                          <Zap className="h-3 w-3 mr-0.5" />
                          Primary
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  {/* Cost */}
                  <TableCell>
                    {provider.is_free_tier ? (
                      <span className="text-success font-bold">FREE</span>
                    ) : (
                      <span className="font-mono">${provider.monthly_cost.toFixed(2)}/mo</span>
                    )}
                  </TableCell>

                  {/* Latency */}
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <Progress 
                        value={(provider.latency_ms / maxLatency) * 100} 
                        className="h-2 flex-1"
                      />
                      <span className={cn(
                        "font-mono text-xs w-12 text-right",
                        provider.latency_ms > 150 ? "text-destructive" : 
                        provider.latency_ms > 100 ? "text-warning" : "text-success"
                      )}>
                        {provider.latency_ms ? `${provider.latency_ms}ms` : '—'}
                      </span>
                    </div>
                  </TableCell>

                  {/* HFT Score */}
                  <TableCell>
                    {benchmark?.hft_score ? (
                      <div className="flex items-center gap-1">
                        <span className={cn(
                          "font-bold",
                          benchmark.hft_score >= 80 ? "text-success" :
                          benchmark.hft_score >= 50 ? "text-warning" : "text-destructive"
                        )}>
                          {benchmark.hft_score.toFixed(0)}
                        </span>
                        <span className="text-xs text-muted-foreground">/100</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    {getStatusBadge(provider.status, provider.is_free_tier)}
                  </TableCell>

                  {/* Actions */}
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {(provider.status === 'not_configured' || !provider.outbound_ip) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={loadingAction !== null}
                          onClick={() => handleDeploy(provider.provider)}
                        >
                          {loadingAction === `deploy-${provider.provider}` ? (
                            <span className="animate-spin">⏳</span>
                          ) : (
                            <Play className="h-3 w-3 mr-1" />
                          )}
                          Deploy
                        </Button>
                      )}
                      
                      {(provider.status === 'running' || provider.status === 'idle') && !provider.is_primary && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={loadingAction !== null}
                          onClick={() => handleSwitchPrimary(provider.provider)}
                        >
                          {loadingAction === `switch-${provider.provider}` ? (
                            <span className="animate-spin">⏳</span>
                          ) : (
                            <Zap className="h-3 w-3 mr-1" />
                          )}
                          Switch
                        </Button>
                      )}
                      
                      {(provider.status === 'running' || provider.status === 'idle') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={loadingAction !== null}
                          onClick={() => handleRunBenchmark(provider.provider)}
                        >
                          {loadingAction === `benchmark-${provider.provider}` ? (
                            <span className="animate-spin">⏳</span>
                          ) : (
                            <BarChart3 className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 mt-4 border-t border-border/50">
        <span>4 free-tier providers available (GCP, Oracle, Azure, AWS)</span>
        <span>Click headers to sort</span>
      </div>
    </Card>
  );
}
