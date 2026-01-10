import { useState, useEffect, useCallback } from 'react';
import { Activity, Cloud, CheckCircle2, XCircle, AlertTriangle, Zap, RefreshCw, Server, Wifi } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useCloudConfig } from '@/hooks/useCloudConfig';
import { useHFTDeployments } from '@/hooks/useHFTDeployments';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IconContainer } from '@/components/ui/IconContainer';
import { checkVpsApiHealth, pingVpsExchanges } from '@/services/vpsApiService';
import { toast } from 'sonner';

interface ExchangePulse {
  id: string;
  exchange_name: string;
  status: 'healthy' | 'jitter' | 'error';
  latency_ms: number;
  is_connected?: boolean;
}

interface RateLimitStat {
  service: string;
  usagePercent: number;
}

interface VpsApiStatus {
  ok: boolean;
  responseMs: number;
  uptime?: number;
  error?: string;
}

const ALL_PROVIDERS = ['contabo', 'vultr', 'aws', 'digitalocean', 'gcp', 'oracle', 'alibaba', 'azure'];

export function InfrastructurePanel() {
  const [pulses, setPulses] = useState<ExchangePulse[]>([]);
  const [rateLimits, setRateLimits] = useState<RateLimitStat[]>([]);
  const [sentimentIndex, setSentimentIndex] = useState<number | null>(null);
  const [vpsExchangeLatency, setVpsExchangeLatency] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { configs } = useCloudConfig();
  const { deployments } = useHFTDeployments();
  const [vpsConfig, setVpsConfig] = useState<{ provider: string } | null>(null);
  const [vpsIp, setVpsIp] = useState<string | null>(null);
  const [vpsApiStatus, setVpsApiStatus] = useState<VpsApiStatus | null>(null);
  const [isTestingApi, setIsTestingApi] = useState(false);

  const fetchPulses = useCallback(async () => {
    try {
      const { data: connections } = await supabase
        .from('exchange_connections')
        .select('exchange_name')
        .eq('is_connected', true);
      
      const connectedNames = connections?.map(c => c.exchange_name.toLowerCase()) || [];
      
      if (connectedNames.length === 0) {
        setPulses([]);
        return;
      }
      
      const { data } = await supabase
        .from('exchange_pulse')
        .select('id, exchange_name, status, latency_ms')
        .order('exchange_name');

      if (data) {
        const connectedOnly = data.filter(p => 
          connectedNames.includes(p.exchange_name.toLowerCase())
        ).map(p => ({
          ...p,
          is_connected: true
        }));
        
        setPulses(connectedOnly as ExchangePulse[]);
      }
    } catch (err) {
      console.error('[InfrastructurePanel] Pulse error:', err);
    }
  }, []);

  const fetchRateLimits = useCallback(async () => {
    const services = ['binance', 'okx', 'bybit'];
    const limits: Record<string, number> = { binance: 1200, okx: 3000, bybit: 2500 };
    
    try {
      const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
      const { data: logs } = await supabase
        .from('api_request_logs')
        .select('exchange_name')
        .gte('request_time', oneMinuteAgo);
      
      const counts: Record<string, number> = {};
      logs?.forEach(log => {
        const svc = log.exchange_name.toLowerCase();
        counts[svc] = (counts[svc] || 0) + 1;
      });
      
      const stats: RateLimitStat[] = services.map(svc => ({
        service: svc,
        usagePercent: Math.min(100, (counts[svc] || 0) / (limits[svc] || 1000) * 100)
      }));
      
      setRateLimits(stats);
    } catch (err) {
      console.error('[InfrastructurePanel] Rate limit error:', err);
    }
  }, []);

  const fetchSentiment = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke('trade-engine', {
        body: { action: 'get-tickers', symbols: ['BTCUSDT', 'ETHUSDT'] }
      });

      if (data?.tickers?.length > 0) {
        const avgChange = data.tickers.reduce((sum: number, t: any) => sum + t.priceChange24h, 0) / data.tickers.length;
        const sentiment = Math.min(100, Math.max(0, 50 + (avgChange * 5)));
        setSentimentIndex(Math.round(sentiment));
      }
    } catch (err) {
      console.error('[InfrastructurePanel] Sentiment error:', err);
    }
  }, []);

  const fetchVpsLatency = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('exchange_pulse')
        .select('latency_ms')
        .eq('source', 'vps');
      
      if (data && data.length > 0) {
        const avgLatency = Math.round(data.reduce((sum, p) => sum + (p.latency_ms || 0), 0) / data.length);
        setVpsExchangeLatency(avgLatency);
      }
    } catch (err) {
      console.error('[InfrastructurePanel] VPS latency error:', err);
    }
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchPulses(), fetchRateLimits(), fetchVpsLatency()]);
    // Use edge function - no IP needed, it will look up from DB
    const status = await checkVpsApiHealth();
    setVpsApiStatus(status);
    setIsRefreshing(false);
  };

  const handleTestVpsApi = async () => {
    setIsTestingApi(true);
    try {
      // Use edge function - no IP needed, it will look up from DB
      const [healthResult, pingResult] = await Promise.all([
        checkVpsApiHealth(),
        pingVpsExchanges()
      ]);
      
      setVpsApiStatus(healthResult);
      
      if (healthResult.ok && pingResult.success) {
        const avgLatency = pingResult.pings.length > 0
          ? Math.round(pingResult.pings.reduce((sum, p) => sum + p.latencyMs, 0) / pingResult.pings.length)
          : 0;
        const pingDesc = pingResult.pings.length > 0 
          ? pingResult.pings.map(p => `${p.exchange}: ${p.latencyMs}ms`).join(', ')
          : 'No exchange pings';
        toast.success(`VPS API Ready (${healthResult.responseMs}ms)`, {
          description: pingDesc
        });
      } else {
        toast.error('VPS API Error', {
          description: healthResult.error || 'Failed to connect to VPS API'
        });
      }
    } catch (err) {
      toast.error('VPS API Test Failed', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setIsTestingApi(false);
    }
  };

  useEffect(() => {
    fetchPulses();
    fetchRateLimits();
    fetchSentiment();
    fetchVpsLatency();
    
    // Fetch VPS config and IP
    supabase.from('vps_config').select('provider').order('updated_at', { ascending: false }).limit(1).single()
      .then(({ data }) => { if (data) setVpsConfig(data); });
    
    // Fetch VPS IP from hft_deployments or vps_instances
    supabase.from('hft_deployments').select('ip_address').eq('status', 'running').limit(1).single()
      .then(({ data }) => {
        if (data?.ip_address) {
          setVpsIp(data.ip_address);
        }
        // Check API health immediately via edge function (no IP needed)
        checkVpsApiHealth().then(setVpsApiStatus);
      });
    
    const pulseInterval = setInterval(fetchPulses, 15000);
    const rateInterval = setInterval(fetchRateLimits, 10000);
    const vpsLatencyInterval = setInterval(fetchVpsLatency, 15000);
    
    // Refresh VPS API status every 30 seconds via edge function
    const vpsApiInterval = setInterval(() => {
      checkVpsApiHealth().then(setVpsApiStatus);
    }, 30000);
    
    return () => {
      clearInterval(pulseInterval);
      clearInterval(rateInterval);
      clearInterval(vpsLatencyInterval);
      clearInterval(vpsApiInterval);
    };
  }, [fetchPulses, fetchRateLimits, fetchSentiment, fetchVpsLatency, vpsIp]);

  const getStatusIcon = (status: string) => {
    if (status === 'healthy') return <CheckCircle2 className="w-2 h-2 text-green-400" />;
    if (status === 'jitter') return <AlertTriangle className="w-2 h-2 text-yellow-400" />;
    return <XCircle className="w-2 h-2 text-red-400" />;
  };

  const getExchangeLabel = (name: string) => {
    const labels: Record<string, string> = {
      binance: 'BIN', okx: 'OKX', bybit: 'BYB', bitget: 'BGT',
      kucoin: 'KUC', mexc: 'MEX', kraken: 'KRK', gateio: 'GAT',
      bingx: 'BNX', hyperliquid: 'HYP', nexo: 'NXO', 'gate.io': 'GAT'
    };
    return labels[name.toLowerCase()] || name.slice(0, 3).toUpperCase();
  };

  const getProviderLabel = (provider: string) => {
    const labels: Record<string, string> = {
      contabo: 'CTB', vultr: 'VLT', aws: 'AWS', digitalocean: 'DO',
      gcp: 'GCP', oracle: 'ORC', alibaba: 'ALI', azure: 'AZR'
    };
    return labels[provider] || provider.slice(0, 3).toUpperCase();
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'running': return 'bg-emerald-500';
      case 'deploying': return 'bg-amber-500 animate-pulse';
      case 'error': return 'bg-red-500';
      default: return 'bg-muted-foreground/30';
    }
  };

  const allProviderStatuses = ALL_PROVIDERS.map(provider => {
    const config = configs.find(c => c.provider === provider);
    const hftDeployment = deployments.find(d => d.provider.toLowerCase() === provider.toLowerCase());
    const isActive = vpsConfig?.provider === provider || !!hftDeployment;
    const status = hftDeployment?.status || (isActive ? 'running' : (config?.status || 'not_configured'));
    return { provider, status, isActive };
  });

  const getSentimentColor = (index: number | null) => {
    if (index === null) return 'text-muted-foreground';
    if (index <= 25) return 'text-red-400';
    if (index <= 45) return 'text-yellow-400';
    if (index <= 55) return 'text-yellow-500';
    if (index <= 75) return 'text-lime-400';
    return 'text-green-400';
  };

  return (
    <div className={cn(
      "card-orange glass-card p-3 h-full flex flex-col gap-2",
      "hover:shadow-lg hover:shadow-orange-500/10 transition-all duration-300"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <IconContainer color="orange" size="sm">
            <Activity className="w-2.5 h-2.5" />
          </IconContainer>
          <span className="text-xs font-semibold">INFRASTRUCTURE</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className={cn("text-sm font-bold", getSentimentColor(sentimentIndex))}>
              {sentimentIndex ?? '--'}
            </span>
            <div className="w-8 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full"
                style={{ 
                  width: `${sentimentIndex ?? 0}%`,
                  background: 'linear-gradient(90deg, rgb(239, 68, 68), rgb(234, 179, 8), rgb(34, 197, 94))'
                }}
              />
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-5 w-5 p-0"
              >
                <RefreshCw className={cn("w-2.5 h-2.5", isRefreshing && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Test network latency to exchanges</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Row 1: Exchange Pulse */}
      <div className="flex-shrink-0">
        <div className="flex items-center gap-1 mb-1">
          <Zap className="w-2.5 h-2.5 text-orange-400" />
          <span className="text-[9px] text-muted-foreground font-medium">Exchange Latency</span>
        </div>
        <div className={`grid gap-1 ${
          pulses.length <= 2 ? 'grid-cols-2' : 
          pulses.length <= 4 ? 'grid-cols-4' : 'grid-cols-6'
        }`}>
          {pulses.map((pulse) => (
            <div
              key={pulse.id}
              className={cn(
                "p-1.5 rounded text-center transition-all duration-200",
                pulse.status === 'healthy' ? 'bg-green-500/10 border border-green-500/30' :
                pulse.status === 'jitter' ? 'bg-yellow-500/10 border border-yellow-500/30' :
                'bg-red-500/10 border border-red-500/30',
                pulse.is_connected && 'ring-1 ring-orange-500/50'
              )}
            >
              <div className="flex items-center justify-center gap-0.5">
                {getStatusIcon(pulse.status)}
                <span className="text-[8px] font-medium">
                  {getExchangeLabel(pulse.exchange_name)}
                </span>
              </div>
              <p className={cn(
                "text-[9px] font-bold mt-0.5",
                pulse.latency_ms < 50 ? 'text-green-400' :
                pulse.latency_ms < 150 ? 'text-yellow-400' : 'text-red-400'
              )}>
                {pulse.latency_ms}ms
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Row 2: VPS API Status */}
      {vpsIp && (
        <div className="flex-shrink-0">
          <div className="flex items-center justify-between gap-1 p-1.5 rounded bg-secondary/30 border border-border/50">
            <div className="flex items-center gap-1.5">
              <Server className="w-3 h-3 text-orange-400" />
              <span className="text-[9px] font-medium">VPS API</span>
              {vpsApiStatus && (
                <div className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold",
                  vpsApiStatus.ok 
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                    : "bg-red-500/20 text-red-400 border border-red-500/30"
                )}>
                  {vpsApiStatus.ok ? (
                    <>
                      <Wifi className="w-2 h-2" />
                      Ready ({vpsApiStatus.responseMs}ms)
                    </>
                  ) : (
                    <>
                      <XCircle className="w-2 h-2" />
                      Offline
                    </>
                  )}
                </div>
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestVpsApi}
                  disabled={isTestingApi}
                  className="h-5 px-2 text-[8px] bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20"
                >
                  {isTestingApi ? (
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                  ) : (
                    'Test API'
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Test VPS API endpoints and exchange pings</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Row 3: Cloud Mesh */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <div className="flex items-center gap-1">
            <Cloud className="w-2 h-2 text-orange-400" />
            <span className="text-[8px] text-muted-foreground">Cloud</span>
          </div>
          {vpsExchangeLatency !== null && (
            <div className="flex items-center gap-0.5">
              <Zap className="w-2 h-2 text-yellow-400" />
              <span className={cn(
                "text-[8px] font-bold",
                vpsExchangeLatency < 50 ? 'text-green-400' :
                vpsExchangeLatency < 100 ? 'text-yellow-400' : 'text-red-400'
              )}>
                VPS→Ex: {vpsExchangeLatency}ms
              </span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-8 gap-0.5">
          {allProviderStatuses.map(({ provider, status, isActive }) => (
            <div 
              key={provider}
              className={cn(
                "p-0.5 rounded text-center transition-all",
                isActive ? 'bg-orange-500/20 border border-orange-500/40' : 'bg-secondary/40 opacity-60'
              )}
            >
              <p className="text-[6px] font-medium truncate">{getProviderLabel(provider)}</p>
              <div className={cn("w-1 h-1 rounded-full mx-auto", getStatusDot(status))} />
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: API Limits */}
      <div className="flex-1 min-h-0 flex items-center gap-1">
        <span className="text-[7px] text-muted-foreground">API:</span>
        {rateLimits.map((stat) => (
          <div key={stat.service} className="flex items-center gap-0.5">
            <span className="text-[7px] font-medium">{stat.service.slice(0, 3).toUpperCase()}</span>
            <Progress value={stat.usagePercent} className="h-1 w-6" />
            <span className="text-[6px] text-muted-foreground">{Math.round(stat.usagePercent)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
