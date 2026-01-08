import { useState, useEffect, useCallback } from 'react';
import { Activity, Cloud, CheckCircle2, XCircle, AlertTriangle, Zap } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useCloudConfig } from '@/hooks/useCloudConfig';
import { useHFTDeployments } from '@/hooks/useHFTDeployments';

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

const ALL_PROVIDERS = ['contabo', 'vultr', 'aws', 'digitalocean', 'gcp', 'oracle', 'alibaba', 'azure'];

export function InfrastructurePanel() {
  const [pulses, setPulses] = useState<ExchangePulse[]>([]);
  const [rateLimits, setRateLimits] = useState<RateLimitStat[]>([]);
  const [sentimentIndex, setSentimentIndex] = useState<number | null>(null);
  const { configs } = useCloudConfig();
  const { deployments } = useHFTDeployments();
  const [vpsConfig, setVpsConfig] = useState<{ provider: string } | null>(null);

  // Fetch exchange pulse - prioritize connected exchanges
  const fetchPulses = useCallback(async () => {
    try {
      const { data: connections } = await supabase
        .from('exchange_connections')
        .select('exchange_name')
        .eq('is_connected', true);
      
      const connectedNames = connections?.map(c => c.exchange_name.toLowerCase()) || [];
      
      const { data } = await supabase
        .from('exchange_pulse')
        .select('id, exchange_name, status, latency_ms')
        .order('exchange_name')
        .limit(6);

      if (data) {
        const sorted = [...data].sort((a, b) => {
          const aConnected = connectedNames.includes(a.exchange_name.toLowerCase());
          const bConnected = connectedNames.includes(b.exchange_name.toLowerCase());
          if (aConnected && !bConnected) return -1;
          if (!aConnected && bConnected) return 1;
          return 0;
        }).map(p => ({
          ...p,
          is_connected: connectedNames.includes(p.exchange_name.toLowerCase())
        }));
        
        setPulses(sorted as ExchangePulse[]);
      }
    } catch (err) {
      console.error('[InfrastructurePanel] Pulse error:', err);
    }
  }, []);

  // Fetch rate limits
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

  // Fetch sentiment
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

  useEffect(() => {
    fetchPulses();
    fetchRateLimits();
    fetchSentiment();
    
    // Fetch VPS config
    supabase.from('vps_config').select('provider').order('updated_at', { ascending: false }).limit(1).single()
      .then(({ data }) => { if (data) setVpsConfig(data); });
    
    const pulseInterval = setInterval(fetchPulses, 15000);
    const rateInterval = setInterval(fetchRateLimits, 10000);
    
    return () => {
      clearInterval(pulseInterval);
      clearInterval(rateInterval);
    };
  }, [fetchPulses, fetchRateLimits, fetchSentiment]);

  const getStatusIcon = (status: string) => {
    if (status === 'healthy') return <CheckCircle2 className="w-2 h-2 text-green-400" />;
    if (status === 'jitter') return <AlertTriangle className="w-2 h-2 text-yellow-400" />;
    return <XCircle className="w-2 h-2 text-red-400" />;
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
      case 'error': return 'bg-destructive';
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
    if (index <= 25) return 'text-destructive';
    if (index <= 45) return 'text-warning';
    if (index <= 55) return 'text-yellow-500';
    if (index <= 75) return 'text-lime-500';
    return 'text-success';
  };

  return (
    <div className="glass-card p-2 h-full flex flex-col gap-1">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-primary" />
          <span className="text-[10px] font-semibold">INFRASTRUCTURE</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-xs font-bold ${getSentimentColor(sentimentIndex)}`}>
            {sentimentIndex ?? '--'}
          </span>
          <div className="w-6 h-1 bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full"
              style={{ 
                width: `${sentimentIndex ?? 0}%`,
                background: 'linear-gradient(90deg, rgb(239, 68, 68), rgb(234, 179, 8), rgb(34, 197, 94))'
              }}
            />
          </div>
        </div>
      </div>

      {/* Row 1: Exchange Pulse - 6 mini boxes */}
      <div className="flex-shrink-0">
        <div className="flex items-center gap-1 mb-0.5">
          <Zap className="w-2 h-2 text-primary" />
          <span className="text-[8px] text-muted-foreground">Exchanges</span>
        </div>
        <div className="grid grid-cols-6 gap-0.5">
          {pulses.slice(0, 6).map((pulse) => (
            <div
              key={pulse.id}
              className={cn(
                "p-0.5 rounded text-center",
                pulse.status === 'healthy' ? 'bg-green-500/10 border border-green-500/30' :
                pulse.status === 'jitter' ? 'bg-yellow-500/10 border border-yellow-500/30' :
                'bg-red-500/10 border border-red-500/30',
                pulse.is_connected && 'ring-1 ring-primary/50'
              )}
            >
              <div className="flex items-center justify-center">
                {getStatusIcon(pulse.status)}
              </div>
              <p className="text-[7px] font-medium truncate">
                {pulse.exchange_name.slice(0, 3).toUpperCase()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Row 2: Cloud Mesh - 8 mini icons */}
      <div className="flex-shrink-0">
        <div className="flex items-center gap-1 mb-0.5">
          <Cloud className="w-2 h-2 text-sky-500" />
          <span className="text-[8px] text-muted-foreground">Cloud</span>
        </div>
        <div className="grid grid-cols-8 gap-0.5">
          {allProviderStatuses.map(({ provider, status, isActive }) => (
            <div 
              key={provider}
              className={cn(
                "p-0.5 rounded text-center transition-all",
                isActive ? 'bg-emerald-500/20 border border-emerald-500/40' : 'bg-secondary/40 opacity-60'
              )}
            >
              <p className="text-[6px] font-medium truncate">{getProviderLabel(provider)}</p>
              <div className={`w-1 h-1 rounded-full mx-auto ${getStatusDot(status)}`} />
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: API Limits - 3 compact bars */}
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