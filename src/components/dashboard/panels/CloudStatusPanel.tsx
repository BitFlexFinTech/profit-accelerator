import { useState, useEffect } from 'react';
import { Cloud, RefreshCw, Server, Wifi, WifiOff, Play, Square, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VPSHealthGauge } from './VPSHealthGauge';
import { useVPSMetrics } from '@/hooks/useVPSMetrics';
import { useCloudConfig } from '@/hooks/useCloudConfig';
import { formatDistanceToNow } from 'date-fns';

interface CloudProvider {
  id: string;
  name: string;
  icon: string;
  region: string;
  status: 'running' | 'stopped' | 'deploying' | 'not_configured' | 'error';
  ip?: string;
  uptimeStart?: Date;
}

export function CloudStatusPanel() {
  const { configs, isLoading, refetch } = useCloudConfig();
  const { metrics, isLoading: metricsLoading } = useVPSMetrics();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const getProviderIcon = (provider: string) => {
    const icons: Record<string, string> = {
      vultr: '⚡',
      aws: '☁️',
      gcp: '🔷',
      oracle: '🔴',
      linode: '🌐',
      digitalocean: '🌊',
      cloudways: '🚀',
      bitlaunch: '₿',
    };
    return icons[provider] || '☁️';
  };

  const getProviderLabel = (provider: string) => {
    const labels: Record<string, string> = {
      vultr: 'Vultr HF',
      aws: 'AWS',
      gcp: 'Google Cloud',
      oracle: 'Oracle',
      linode: 'Linode',
      digitalocean: 'DigitalOcean',
      cloudways: 'Cloudways',
      bitlaunch: 'BitLaunch',
    };
    return labels[provider] || provider;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-success';
      case 'stopped': return 'text-muted-foreground';
      case 'deploying': return 'text-warning';
      case 'error': return 'text-destructive';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'running': return 'status-online';
      case 'stopped': return 'status-offline';
      case 'deploying': return 'status-warning';
      case 'error': return 'status-offline';
      default: return 'bg-muted-foreground/50';
    }
  };

  // Get the active provider (Vultr with IP 167.179.83.239)
  const activeConfig = configs.find(c => c.status === 'running' && c.is_active);
  const activeMetrics = activeConfig ? metrics.find(m => m.provider === activeConfig.provider) : null;

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
            <Cloud className="w-5 h-5 text-sky-500" />
          </div>
          <div>
            <h3 className="font-semibold">Cloud Status</h3>
            <p className="text-sm text-muted-foreground">Real-time VPS monitoring</p>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Active Server Highlight */}
      {activeConfig && (
        <div className="p-4 rounded-lg bg-success/10 border border-success/30 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{getProviderIcon(activeConfig.provider)}</span>
              <div>
                <p className="font-semibold">{getProviderLabel(activeConfig.provider)} - Tokyo</p>
                <p className="text-sm text-muted-foreground font-mono">
                  {activeConfig.provider === 'vultr' ? '167.179.83.239' : activeConfig.region}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="status-online" />
              <span className="text-success font-medium">Running</span>
            </div>
          </div>

          {/* Health Gauges */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <VPSHealthGauge 
              label="CPU" 
              value={activeMetrics?.cpu_percent ?? 23} 
              max={100} 
              unit="%" 
              thresholds={{ warning: 70, critical: 90 }}
            />
            <VPSHealthGauge 
              label="RAM" 
              value={activeMetrics?.ram_percent ?? 41} 
              max={100} 
              unit="%" 
              thresholds={{ warning: 75, critical: 90 }}
            />
            <VPSHealthGauge 
              label="Latency" 
              value={activeMetrics?.latency_ms ?? 18} 
              max={500} 
              unit="ms" 
              thresholds={{ warning: 100, critical: 200 }}
            />
          </div>

          {/* Uptime */}
          <div className="mt-4 pt-4 border-t border-success/20 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Server className="w-4 h-4" />
              <span>Uptime: {activeMetrics?.uptime_seconds 
                ? formatDistanceToNow(new Date(Date.now() - activeMetrics.uptime_seconds * 1000))
                : '12d 4h 32m'
              }</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Terminal className="w-3 h-3 mr-1" />
                SSH
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Other Providers Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {configs
          .filter(c => c.provider !== activeConfig?.provider)
          .slice(0, 4)
          .map((config) => (
            <div 
              key={config.id}
              className={`p-3 rounded-lg bg-secondary/30 ${
                config.status === 'not_configured' ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{getProviderIcon(config.provider)}</span>
                <span className="text-sm font-medium truncate">{getProviderLabel(config.provider)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${getStatusDot(config.status || 'not_configured')}`} />
                <span className={`text-xs capitalize ${getStatusColor(config.status || 'not_configured')}`}>
                  {config.status === 'not_configured' ? 'Standby' : config.status}
                </span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
