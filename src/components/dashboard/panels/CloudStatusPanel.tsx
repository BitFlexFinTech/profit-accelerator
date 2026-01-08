import { useState, useEffect } from 'react';
import { Cloud, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCloudConfig } from '@/hooks/useCloudConfig';
import { useHFTDeployments } from '@/hooks/useHFTDeployments';
import { supabase } from '@/integrations/supabase/client';

const ALL_PROVIDERS = ['contabo', 'vultr', 'aws', 'digitalocean', 'gcp', 'oracle', 'alibaba', 'azure'];

interface CloudStatusPanelProps {
  compact?: boolean;
}

export function CloudStatusPanel({ compact = false }: CloudStatusPanelProps) {
  const { configs, isLoading, refetch } = useCloudConfig();
  const { deployments } = useHFTDeployments();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [vpsConfig, setVpsConfig] = useState<{ provider: string; outbound_ip: string; status: string } | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const getProviderIcon = (provider: string) => {
    const icons: Record<string, string> = {
      contabo: '🌏',
      vultr: '🦅',
      aws: '☁️',
      digitalocean: '🌊',
      gcp: '🔵',
      oracle: '🔴',
      alibaba: '🟠',
      azure: '💠',
    };
    return icons[provider] || '☁️';
  };

  const getProviderLabel = (provider: string) => {
    const labels: Record<string, string> = {
      contabo: 'CTB',
      vultr: 'VLT',
      aws: 'AWS',
      digitalocean: 'DO',
      gcp: 'GCP',
      oracle: 'ORC',
      alibaba: 'ALI',
      azure: 'AZR',
    };
    return labels[provider] || provider.slice(0, 3).toUpperCase();
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'running': return 'bg-emerald-500';
      case 'stopped': return 'bg-muted-foreground/50';
      case 'deploying': return 'bg-amber-500 animate-pulse';
      case 'error': return 'bg-destructive';
      default: return 'bg-muted-foreground/30';
    }
  };

  useEffect(() => {
    const fetchVpsConfig = async () => {
      const { data } = await supabase
        .from('vps_config')
        .select('provider, outbound_ip, status')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      if (data) setVpsConfig(data);
    };
    fetchVpsConfig();
  }, []);

  const getHFTDeploymentForProvider = (provider: string) => {
    return deployments.find(d => d.provider.toLowerCase() === provider.toLowerCase());
  };

  const allProviderStatuses = ALL_PROVIDERS.map(provider => {
    const config = configs.find(c => c.provider === provider);
    const hftDeployment = getHFTDeploymentForProvider(provider);
    const isActive = vpsConfig?.provider === provider || !!hftDeployment;
    const status = hftDeployment?.status || (isActive ? 'running' : (config?.status || 'not_configured'));
    
    return {
      provider,
      status,
      isActive,
    };
  });

  return (
    <div className={`glass-card ${compact ? 'p-2' : 'p-4'} h-full flex flex-col`}>
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Cloud className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} text-sky-500`} />
          <h3 className={`font-semibold ${compact ? 'text-xs' : 'text-sm'}`}>Cloud Mesh</h3>
          {vpsConfig?.outbound_ip && (
            <span className="text-[9px] text-muted-foreground font-mono">
              {vpsConfig.outbound_ip}
            </span>
          )}
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isRefreshing}
          className={compact ? "h-5 w-5 p-0" : "h-7 px-2"}
        >
          <RefreshCw className={`${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Compact 8-Cloud Grid */}
      <div className={`grid ${compact ? 'grid-cols-8 gap-1' : 'grid-cols-4 gap-2'} flex-1`}>
        {allProviderStatuses.map(({ provider, status, isActive }) => (
          <div 
            key={provider}
            className={`${compact ? 'p-1' : 'p-2'} rounded text-center transition-all ${
              isActive 
                ? 'bg-emerald-500/20 border border-emerald-500/40' 
                : status === 'running' 
                  ? 'bg-primary/10 border border-primary/20'
                  : 'bg-secondary/40 opacity-60'
            }`}
          >
            <span className={compact ? 'text-sm' : 'text-base'}>{getProviderIcon(provider)}</span>
            <p className={`font-medium mt-0.5 truncate ${compact ? 'text-[8px]' : 'text-[10px]'}`}>
              {getProviderLabel(provider)}
            </p>
            <div className={`${compact ? 'w-1 h-1' : 'w-1.5 h-1.5'} rounded-full mx-auto mt-0.5 ${getStatusDot(status)}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
