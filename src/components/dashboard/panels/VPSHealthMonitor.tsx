import { useState, useEffect, forwardRef } from 'react';
import { Activity, Cpu, HardDrive, Wifi, Server, RefreshCw, AlertCircle, Zap, CheckCircle2, XCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store/useAppStore';
import { ActionButton } from '@/components/ui/ActionButton';
import { BUTTON_TOOLTIPS } from '@/config/buttonTooltips';
import { cn } from '@/lib/utils';
import { checkVpsApiHealth, pingVpsExchanges, type VpsHealthResponse, type VpsPingResponse } from '@/services/vpsApiService';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface VpsHealthData {
  provider: string;
  status: 'healthy' | 'warning' | 'error' | 'offline' | 'not_deployed';
  publicIp: string | null;
  region: string;
  cpuPercent: number;
  memoryPercent: number;
  latencyMs: number;
  lastHealthCheck: Date | null;
}

interface ApiStatus {
  checked: boolean;
  ok: boolean;
  responseMs: number;
  error?: string;
}

const PROVIDER_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  aws: { bg: 'bg-orange-500/20', border: 'border-orange-500', text: 'text-orange-400' },
  digitalocean: { bg: 'bg-sky-400/20', border: 'border-sky-400', text: 'text-sky-400' },
  vultr: { bg: 'bg-amber-400/20', border: 'border-amber-400', text: 'text-amber-400' },
  contabo: { bg: 'bg-pink-500/20', border: 'border-pink-500', text: 'text-pink-400' },
  oracle: { bg: 'bg-rose-500/20', border: 'border-rose-500', text: 'text-rose-400' },
  gcp: { bg: 'bg-emerald-400/20', border: 'border-emerald-400', text: 'text-emerald-400' },
  alibaba: { bg: 'bg-violet-500/20', border: 'border-violet-500', text: 'text-violet-400' },
  azure: { bg: 'bg-cyan-500/20', border: 'border-cyan-500', text: 'text-cyan-400' },
};

const PROVIDER_NAMES: Record<string, string> = {
  aws: 'AWS',
  digitalocean: 'DO',
  vultr: 'Vultr',
  contabo: 'Contabo',
  oracle: 'Oracle',
  gcp: 'GCP',
  alibaba: 'Alibaba',
  azure: 'Azure',
};

export const VPSHealthMonitor = forwardRef<HTMLDivElement>((_, ref) => {
  const [healthData, setHealthData] = useState<VpsHealthData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [apiStatus, setApiStatus] = useState<Record<string, ApiStatus>>({});
  const [pingResults, setPingResults] = useState<VpsPingResponse | null>(null);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [showPingResults, setShowPingResults] = useState(false);
  const { syncFromDatabase } = useAppStore();

  const fetchHealthData = async () => {
    try {
      // Fetch VPS config
      const { data: vpsConfigs } = await supabase
        .from('vps_config')
        .select('provider, status, outbound_ip, region');

      // Fetch latest metrics for each provider (CPU/RAM only)
      const { data: metricsData } = await supabase
        .from('vps_metrics')
        .select('provider, cpu_percent, ram_percent, recorded_at')
        .order('recorded_at', { ascending: false });

      // CRITICAL FIX: Fetch VPS→Exchange latency from exchange_pulse WHERE source='vps'
      const { data: pulseData } = await supabase
        .from('exchange_pulse')
        .select('latency_ms')
        .eq('source', 'vps');

      // Calculate average VPS→Exchange latency (HFT-relevant)
      const avgExchangeLatency = pulseData?.length 
        ? Math.round(pulseData.reduce((sum, p) => sum + (p.latency_ms || 0), 0) / pulseData.length)
        : 0;

      // CRITICAL FIX: Only show DEPLOYED providers (not all 8!)
      const { data: hftDeploys } = await supabase
        .from('hft_deployments')
        .select('provider, ip_address, status, bot_status, region')
        .in('status', ['active', 'running']);

      const healthList: VpsHealthData[] = [];

      // Only iterate over deployed providers
      const deployedProviders = new Set<string>();
      vpsConfigs?.forEach(c => {
        if (c.status === 'running') deployedProviders.add(c.provider);
      });
      hftDeploys?.forEach(d => {
        if (d.status === 'active' || d.status === 'running') deployedProviders.add(d.provider.toLowerCase());
      });

      for (const provider of Array.from(deployedProviders)) {
        const config = vpsConfigs?.find(v => v.provider === provider);
        const hft = hftDeploys?.find(d => d.provider.toLowerCase() === provider);
        const metrics = metricsData?.find(m => m.provider === provider);
        
        const statusMap: Record<string, 'healthy' | 'warning' | 'error' | 'offline'> = {
          running: 'healthy',
          active: 'healthy',
          provisioning: 'warning',
          stopped: 'offline',
          error: 'error',
        };

        healthList.push({
          provider,
          status: hft?.status 
            ? statusMap[hft.status] || 'healthy'
            : (config?.status ? statusMap[config.status] || 'error' : 'not_deployed'),
          publicIp: hft?.ip_address || config?.outbound_ip || null,
          region: hft?.region || config?.region || '---',
          cpuPercent: metrics?.cpu_percent || 0,
          memoryPercent: metrics?.ram_percent || 0,
          latencyMs: avgExchangeLatency,
          lastHealthCheck: metrics?.recorded_at ? new Date(metrics.recorded_at) : null,
        });
      }

      setHealthData(healthList);
      
      // Auto-check API health for each VPS with IP
      const newApiStatus: Record<string, ApiStatus> = {};
      for (const vps of healthList) {
        if (vps.publicIp) {
          const result = await checkVpsApiHealth(vps.publicIp);
          newApiStatus[vps.provider] = {
            checked: true,
            ok: result.ok,
            responseMs: result.responseMs,
            error: result.error,
          };
        }
      }
      setApiStatus(newApiStatus);
    } catch (err) {
      console.error('[VPSHealthMonitor] Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchHealthData();
    await syncFromDatabase();
    setIsRefreshing(false);
  };

  const handleTestApi = async () => {
    const vpsWithIp = healthData.find(v => v.publicIp);
    if (!vpsWithIp?.publicIp) {
      toast.error('No VPS with IP found');
      return;
    }

    setIsTestingApi(true);
    try {
      // Test health endpoint
      const healthResult = await checkVpsApiHealth(vpsWithIp.publicIp);
      
      // Test ping exchanges endpoint
      const pingResult = await pingVpsExchanges(vpsWithIp.publicIp);
      
      setApiStatus(prev => ({
        ...prev,
        [vpsWithIp.provider]: {
          checked: true,
          ok: healthResult.ok,
          responseMs: healthResult.responseMs,
          error: healthResult.error,
        }
      }));
      
      setPingResults(pingResult);
      setShowPingResults(true);

      if (healthResult.ok) {
        toast.success(`VPS API Ready (${healthResult.responseMs}ms)`);
      } else {
        toast.error(`VPS API Error: ${healthResult.error}`);
      }
    } catch (err) {
      toast.error('Failed to test VPS API');
    } finally {
      setIsTestingApi(false);
    }
  };

  // Use SSOT lastUpdate to trigger refetch
  const lastUpdate = useAppStore((s) => s.lastUpdate);
  
  useEffect(() => {
    fetchHealthData();
  }, [lastUpdate]);

  // Auto-refresh every 5 seconds for real-time monitoring (strict rule)
  useEffect(() => {
    const interval = setInterval(fetchHealthData, 5000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: VpsHealthData['status']) => {
    switch (status) {
      case 'healthy':
        return <div className="w-3 h-3 rounded-full bg-emerald-400 animate-blink" />;
      case 'warning':
        return <div className="w-3 h-3 rounded-full bg-amber-400 animate-blink" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-rose-400 animate-blink" />;
      case 'offline':
        return <div className="w-3 h-3 rounded-full bg-muted" />;
      default:
        return <div className="w-3 h-3 rounded-full bg-muted/50" />;
    }
  };

  const getCpuColor = (percent: number) => {
    if (percent >= 80) return 'text-rose-400';
    if (percent >= 50) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const deployedCount = healthData.length;
  const healthyCount = healthData.filter(h => h.status === 'healthy').length;
  const noDeployments = deployedCount === 0;
  const hasApiReady = Object.values(apiStatus).some(s => s.ok);

  return (
    <div ref={ref} className="glass-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary animate-blink" />
          <h2 className="font-semibold">VPS Health Monitoring</h2>
          {noDeployments ? (
            <span className="text-xs text-muted-foreground px-2 py-0.5 bg-secondary rounded-full">
              No deployments
            </span>
          ) : (
            <>
              <span className="text-xs text-muted-foreground px-2 py-0.5 bg-secondary rounded-full">
                {healthyCount}/{deployedCount} healthy
              </span>
              {hasApiReady && (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Zap className="w-3 h-3" />
                  API Ready
                </span>
              )}
            </>
          )}
          <span className="text-[9px] text-muted-foreground bg-secondary/50 px-1.5 rounded">10s refresh</span>
        </div>
        <div className="flex items-center gap-2">
          {!noDeployments && (
            <ActionButton 
              variant="outline" 
              size="sm" 
              onClick={handleTestApi}
              disabled={isTestingApi}
              className="gap-1 transition-all duration-300 border-primary/50 hover:bg-primary/10"
              tooltip="Test VPS API endpoints (/health, /ping-exchanges)"
            >
              {isTestingApi ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              Test API
            </ActionButton>
          )}
          <ActionButton 
            variant="ghost" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-1 transition-all duration-300"
            tooltip={BUTTON_TOOLTIPS.refreshData}
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && 'animate-spin')} />
            Refresh
          </ActionButton>
        </div>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">Loading health data...</div>
        ) : noDeployments ? (
          <div className="text-center py-8">
            <Server className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No VPS deployed yet</p>
            <p className="text-xs text-muted-foreground mt-1">Deploy a VPS from Settings to start trading</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {healthData.map((vps, index) => {
                const colors = PROVIDER_COLORS[vps.provider] || PROVIDER_COLORS.aws;
                const name = PROVIDER_NAMES[vps.provider] || vps.provider.toUpperCase();
                const api = apiStatus[vps.provider];

                return (
                  <div 
                    key={vps.provider}
                    className={cn(
                      "p-3 rounded-lg border transition-all duration-300 animate-fade-slide-in",
                      colors.border,
                      colors.bg
                    )}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Server className={cn("w-4 h-4", colors.text)} />
                        <span className={cn("font-semibold", colors.text)}>{name}</span>
                      </div>
                      {getStatusIcon(vps.status)}
                    </div>

                    {/* IP Address */}
                    <div className="text-xs text-muted-foreground mb-2">
                      <span className="font-mono">
                        {vps.publicIp || 'Provisioning...'}
                      </span>
                    </div>

                    {/* API Status */}
                    {api?.checked && (
                      <div className="flex items-center gap-2 mb-2 p-1.5 rounded bg-background/50">
                        {api.ok ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-400" />
                        )}
                        <span className="text-xs flex-1">
                          {api.ok ? 'API Ready' : 'API Down'}
                        </span>
                        <span className={cn(
                          "text-xs font-mono",
                          api.ok ? 'text-emerald-400' : 'text-rose-400'
                        )}>
                          {api.responseMs}ms
                        </span>
                      </div>
                    )}

                    {/* Metrics */}
                    <div className="space-y-2">
                      {/* CPU */}
                      <div className="flex items-center gap-2">
                        <Cpu className="w-3 h-3 text-muted-foreground" />
                        <div className="flex-1">
                          <Progress value={vps.cpuPercent} className="h-1.5" />
                        </div>
                        <span className={cn(
                          "text-xs font-mono transition-colors duration-300",
                          getCpuColor(vps.cpuPercent)
                        )}>
                          {vps.cpuPercent}%
                        </span>
                      </div>

                      {/* Memory */}
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-3 h-3 text-muted-foreground" />
                        <div className="flex-1">
                          <Progress value={vps.memoryPercent} className="h-1.5" />
                        </div>
                        <span className={cn(
                          "text-xs font-mono transition-colors duration-300",
                          getCpuColor(vps.memoryPercent)
                        )}>
                          {vps.memoryPercent}%
                        </span>
                      </div>

                      {/* Latency - VPS→Exchange (HFT-relevant) */}
                      <div className="flex items-center gap-2">
                        <Wifi className="w-3 h-3 text-muted-foreground animate-blink" />
                        <span className="text-xs text-muted-foreground flex-1">VPS→Exchange</span>
                        <span className={cn(
                          "text-xs font-mono transition-colors duration-300",
                          vps.latencyMs < 50 ? 'text-emerald-400' : 
                          vps.latencyMs < 100 ? 'text-amber-400' : 'text-rose-400'
                        )}>
                          {vps.latencyMs > 0 ? `${vps.latencyMs}ms` : '---'}
                        </span>
                      </div>
                    </div>

                    {/* Region */}
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {vps.region}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Exchange Ping Results */}
            {pingResults && (
              <Collapsible open={showPingResults} onOpenChange={setShowPingResults} className="mt-4">
                <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50">
                  <Wifi className="w-4 h-4" />
                  <span>Exchange Ping Results ({pingResults.pings.length} exchanges)</span>
                  <span className="ml-auto text-xs font-mono">{pingResults.responseMs}ms total</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {pingResults.pings.map((ping) => (
                      <div 
                        key={ping.exchange}
                        className={cn(
                          "p-2 rounded-lg border text-xs",
                          ping.success 
                            ? "bg-emerald-500/10 border-emerald-500/30" 
                            : "bg-rose-500/10 border-rose-500/30"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{ping.exchange}</span>
                          {ping.success ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-rose-400" />
                          )}
                        </div>
                        <div className={cn(
                          "font-mono mt-1",
                          ping.success ? "text-emerald-400" : "text-rose-400"
                        )}>
                          {ping.success ? `${ping.latencyMs}ms` : ping.error || 'Failed'}
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </div>
    </div>
  );
});

VPSHealthMonitor.displayName = 'VPSHealthMonitor';
