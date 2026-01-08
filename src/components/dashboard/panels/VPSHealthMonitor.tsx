import { useState, useEffect, forwardRef } from 'react';
import { Activity, Cpu, HardDrive, Wifi, Server, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store/useAppStore';

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

const PROVIDER_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  aws: { bg: 'bg-orange-500/20', border: 'border-orange-500', text: 'text-orange-400' },
  digitalocean: { bg: 'bg-sky-400/20', border: 'border-sky-400', text: 'text-sky-400' },
  vultr: { bg: 'bg-yellow-400/20', border: 'border-yellow-400', text: 'text-yellow-400' },
  contabo: { bg: 'bg-pink-500/20', border: 'border-pink-500', text: 'text-pink-400' },
  oracle: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-400' },
  gcp: { bg: 'bg-green-400/20', border: 'border-green-400', text: 'text-green-400' },
  alibaba: { bg: 'bg-purple-500/20', border: 'border-purple-500', text: 'text-purple-400' },
  azure: { bg: 'bg-teal-500/20', border: 'border-teal-500', text: 'text-teal-400' },
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
  const { vpsStatus, syncFromDatabase } = useAppStore();

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
      // This is the HFT-relevant latency, NOT the Edge→VPS latency in vps_metrics
      const { data: pulseData } = await supabase
        .from('exchange_pulse')
        .select('latency_ms')
        .eq('source', 'vps');

      // Calculate average VPS→Exchange latency (HFT-relevant)
      const avgExchangeLatency = pulseData?.length 
        ? Math.round(pulseData.reduce((sum, p) => sum + (p.latency_ms || 0), 0) / pulseData.length)
        : 0;

      const providers = ['aws', 'digitalocean', 'vultr', 'contabo', 'oracle', 'gcp', 'alibaba', 'azure'];
      const healthList: VpsHealthData[] = [];

      for (const provider of providers) {
        const config = vpsConfigs?.find(v => v.provider === provider);
        const metrics = metricsData?.find(m => m.provider === provider);
        const isDeployed = config?.status === 'running';
        
        const statusMap: Record<string, 'healthy' | 'warning' | 'error' | 'offline'> = {
          running: 'healthy',
          provisioning: 'warning',
          stopped: 'offline',
          error: 'error',
        };

        healthList.push({
          provider,
          status: config?.status 
            ? statusMap[config.status] || 'error' 
            : 'not_deployed',
          publicIp: config?.outbound_ip || null,
          region: config?.region || '---',
          cpuPercent: metrics?.cpu_percent || 0,
          memoryPercent: metrics?.ram_percent || 0,
          // Use VPS→Exchange latency for deployed VPS, 0 for non-deployed
          latencyMs: isDeployed ? avgExchangeLatency : 0,
          lastHealthCheck: metrics?.recorded_at ? new Date(metrics.recorded_at) : null,
        });
      }

      setHealthData(healthList);
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

  useEffect(() => {
    fetchHealthData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchHealthData, 30000);

    // Subscribe to realtime updates
    const channel = supabase
      .channel('vps-health-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vps_config' }, () => {
        fetchHealthData();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vps_metrics' }, () => {
        fetchHealthData();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const getStatusIcon = (status: VpsHealthData['status']) => {
    switch (status) {
      case 'healthy':
        return <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />;
      case 'warning':
        return <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      case 'offline':
        return <div className="w-3 h-3 rounded-full bg-muted" />;
      default:
        return <div className="w-3 h-3 rounded-full bg-muted/50" />;
    }
  };

  const getCpuColor = (percent: number) => {
    if (percent >= 80) return 'text-destructive';
    if (percent >= 50) return 'text-yellow-400';
    return 'text-success';
  };

  const deployedCount = healthData.filter(h => h.status !== 'not_deployed').length;
  const healthyCount = healthData.filter(h => h.status === 'healthy').length;

  return (
    <div ref={ref} className="glass-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">VPS Health Monitoring</h2>
          <span className="text-xs text-muted-foreground px-2 py-0.5 bg-secondary rounded-full">
            {healthyCount}/{deployedCount} healthy
          </span>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="gap-1"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">Loading health data...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {healthData.map((vps) => {
              const colors = PROVIDER_COLORS[vps.provider] || PROVIDER_COLORS.aws;
              const name = PROVIDER_NAMES[vps.provider] || vps.provider.toUpperCase();
              const isDeployed = vps.status !== 'not_deployed';

              return (
                <div 
                  key={vps.provider}
                  className={`p-3 rounded-lg border ${colors.border} ${colors.bg} transition-all duration-300`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Server className={`w-4 h-4 ${colors.text}`} />
                      <span className={`font-semibold ${colors.text}`}>{name}</span>
                    </div>
                    {getStatusIcon(vps.status)}
                  </div>

                  {isDeployed ? (
                    <>
                      {/* IP Address */}
                      <div className="text-xs text-muted-foreground mb-2">
                        <span className="font-mono">
                          {vps.publicIp || 'Provisioning...'}
                        </span>
                      </div>

                      {/* Metrics */}
                      <div className="space-y-2">
                        {/* CPU */}
                        <div className="flex items-center gap-2">
                          <Cpu className="w-3 h-3 text-muted-foreground" />
                          <div className="flex-1">
                            <Progress 
                              value={vps.cpuPercent} 
                              className="h-1.5"
                            />
                          </div>
                          <span className={`text-xs font-mono ${getCpuColor(vps.cpuPercent)}`}>
                            {vps.cpuPercent}%
                          </span>
                        </div>

                        {/* Memory */}
                        <div className="flex items-center gap-2">
                          <HardDrive className="w-3 h-3 text-muted-foreground" />
                          <div className="flex-1">
                            <Progress 
                              value={vps.memoryPercent} 
                              className="h-1.5"
                            />
                          </div>
                          <span className={`text-xs font-mono ${getCpuColor(vps.memoryPercent)}`}>
                            {vps.memoryPercent}%
                          </span>
                        </div>

                        {/* Latency - VPS→Exchange (HFT-relevant) */}
                        <div className="flex items-center gap-2">
                          <Wifi className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground flex-1">VPS→Exchange</span>
                          <span className={`text-xs font-mono ${
                            vps.latencyMs < 50 ? 'text-success' : 
                            vps.latencyMs < 100 ? 'text-yellow-400' : 'text-destructive'
                          }`}>
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
                    </>
                  ) : (
                    <div className="py-4 text-center">
                      <span className="text-xs text-muted-foreground">Not Deployed</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

VPSHealthMonitor.displayName = 'VPSHealthMonitor';
