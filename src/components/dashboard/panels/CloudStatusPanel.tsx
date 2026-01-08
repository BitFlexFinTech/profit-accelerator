import { useState, useEffect } from 'react';
import { Cloud, RefreshCw, Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCloudConfig } from '@/hooks/useCloudConfig';
import { useHFTDeployments } from '@/hooks/useHFTDeployments';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

// All 8 supported cloud providers
const ALL_PROVIDERS = ['contabo', 'vultr', 'aws', 'digitalocean', 'gcp', 'oracle', 'alibaba', 'azure'];

export function CloudStatusPanel() {
  const { configs, isLoading, refetch } = useCloudConfig();
  const { deployments, startBot, stopBot, actionLoading, getTokyoDeployment } = useHFTDeployments();
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

  // Get Tokyo HFT deployment
  const tokyoDeployment = getTokyoDeployment();

  // Check for active HFT deployment per provider
  const getHFTDeploymentForProvider = (provider: string) => {
    return deployments.find(d => d.provider.toLowerCase() === provider.toLowerCase());
  };

  // Merge configured providers with all providers to show 8
  const allProviderStatuses = ALL_PROVIDERS.map(provider => {
    const config = configs.find(c => c.provider === provider);
    const hftDeployment = getHFTDeploymentForProvider(provider);
    const isActive = vpsConfig?.provider === provider || !!hftDeployment;
    const status = hftDeployment?.status || (isActive ? 'running' : (config?.status || 'not_configured'));
    
    return {
      provider,
      status,
      isActive,
      ip: hftDeployment?.ip_address || (isActive ? vpsConfig?.outbound_ip : undefined),
      hftDeployment,
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
            {(tokyoDeployment?.ip_address || vpsConfig?.outbound_ip) && (
              <p className="text-xs text-muted-foreground font-mono">
                {tokyoDeployment?.ip_address || vpsConfig?.outbound_ip}
              </p>
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

      {/* Tokyo HFT Server Banner - Show if deployed */}
      {tokyoDeployment && (
        <div className="mb-3 p-2 rounded-lg bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🗼</span>
              <div>
                <p className="text-xs font-semibold">{tokyoDeployment.server_name || 'Tokyo HFT'}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{tokyoDeployment.ip_address}</p>
              </div>
              <span 
                className={cn(
                  "text-[10px] h-4 px-1.5 py-0.5 rounded border",
                  tokyoDeployment.bot_status === 'running' 
                    ? 'bg-success/10 text-success border-success/30' 
                    : 'bg-muted text-muted-foreground border-border'
                )}
              >
                {tokyoDeployment.bot_status === 'running' ? 'Bot Running' : 'Bot Stopped'}
              </span>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => startBot(tokyoDeployment.id)}
                disabled={actionLoading === tokyoDeployment.id || tokyoDeployment.bot_status === 'running'}
              >
                <Play className="h-3 w-3 text-success" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => stopBot(tokyoDeployment.id)}
                disabled={actionLoading === tokyoDeployment.id || tokyoDeployment.bot_status === 'stopped'}
              >
                <Square className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Compact 8-Cloud Grid */}
      <div className="grid grid-cols-4 gap-2">
        {allProviderStatuses.map(({ provider, status, isActive, hftDeployment }) => (
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
            {hftDeployment && (
              <p className="text-[8px] text-muted-foreground mt-0.5 truncate">
                {hftDeployment.bot_status === 'running' ? '● Bot' : '○ Bot'}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
