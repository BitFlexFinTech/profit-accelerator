import { useState, useEffect } from 'react';
import { Cloud, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCloudConfig } from '@/hooks/useCloudConfig';
import { supabase } from '@/integrations/supabase/client';

// All 8 supported cloud providers
const ALL_PROVIDERS = ['contabo', 'vultr', 'aws', 'digitalocean', 'gcp', 'oracle', 'alibaba', 'azure'];

export function CloudStatusPanel() {
  const { configs, isLoading, refetch } = useCloudConfig();
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
      contabo: 'Contabo',
      vultr: 'Vultr',
      aws: 'AWS',
      digitalocean: 'DO',
      gcp: 'GCP',
      oracle: 'Oracle',
      alibaba: 'Alibaba',
      azure: 'Azure',
    };
    return labels[provider] || provider;
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

  // Merge configured providers with all providers to show 8
  const allProviderStatuses = ALL_PROVIDERS.map(provider => {
    const config = configs.find(c => c.provider === provider);
    const isActive = vpsConfig?.provider === provider;
    return {
      provider,
      status: isActive ? 'running' : (config?.status || 'not_configured'),
      isActive,
      ip: isActive ? vpsConfig?.outbound_ip : undefined,
    };
  });

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center">
            <Cloud className="w-4 h-4 text-sky-500" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Cloud Mesh</h3>
            {vpsConfig?.outbound_ip && (
              <p className="text-xs text-muted-foreground font-mono">{vpsConfig.outbound_ip}</p>
            )}
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="h-7 px-2"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Compact 8-Cloud Grid */}
      <div className="grid grid-cols-4 gap-2">
        {allProviderStatuses.map(({ provider, status, isActive }) => (
          <div 
            key={provider}
            className={`p-2 rounded-lg text-center transition-all ${
              isActive 
                ? 'bg-emerald-500/20 border border-emerald-500/40 ring-1 ring-emerald-500/20' 
                : status === 'running' 
                  ? 'bg-primary/10 border border-primary/20'
                  : 'bg-secondary/40 opacity-70'
            }`}
          >
            <span className="text-base">{getProviderIcon(provider)}</span>
            <p className="text-[10px] font-medium mt-0.5 truncate">{getProviderLabel(provider)}</p>
            <div className={`w-1.5 h-1.5 rounded-full mx-auto mt-1 ${getStatusDot(status)}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
