import { useState, useEffect } from 'react';
import { Server, RefreshCw, Cpu, HardDrive, Activity, Wifi, Clock, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useVPSMetrics } from '@/hooks/useVPSMetrics';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface VPSConfig {
  id: string;
  provider: string;
  region: string;
  status: string;
  outbound_ip: string | null;
}

export function VPSMonitorPanel() {
  const { metrics, isLoading, refetch } = useVPSMetrics();
  const [vpsConfig, setVpsConfig] = useState<VPSConfig | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);

  useEffect(() => {
    fetchVPSConfig();
    fetchMetricsHistory();
  }, []);

  const fetchVPSConfig = async () => {
    const { data } = await supabase
      .from('vps_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    if (data) setVpsConfig(data);
  };

  const fetchMetricsHistory = async () => {
    const { data } = await supabase
      .from('vps_metrics')
      .select('cpu_percent, ram_percent, network_in_mbps, network_out_mbps, recorded_at')
      .order('recorded_at', { ascending: true })
      .limit(20);

    if (data) {
      setMetricsHistory(data.map((m, i) => ({
        time: i + 1,
        cpu: m.cpu_percent || 0,
        ram: m.ram_percent || 0,
        netIn: m.network_in_mbps || 0,
        netOut: m.network_out_mbps || 0,
      })));
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-vps-health', {
        body: { provider: 'contabo' }
      });
      
      if (error) throw error;
      
      await refetch();
      await fetchMetricsHistory();
      toast.success('VPS metrics refreshed');
    } catch (err) {
      toast.error('Failed to refresh metrics');
    } finally {
      setIsRefreshing(false);
    }
  };

  const currentMetric = metrics.find(m => m.provider === 'contabo') || metrics[0];

  const getProgressColor = (value: number, warning: number, critical: number) => {
    if (value >= critical) return 'bg-destructive';
    if (value >= warning) return 'bg-warning';
    return 'bg-success';
  };

  const formatUptime = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  };

  if (!vpsConfig) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center">
            <Server className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold">VPS Monitor</h3>
            <p className="text-sm text-muted-foreground">No VPS configured</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Configure a Contabo VPS in Settings to view metrics.</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Server className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">🌏 Contabo Singapore</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                vpsConfig.status === 'running' 
                  ? 'bg-success/20 text-success' 
                  : 'bg-muted text-muted-foreground'
              }`}>
                {vpsConfig.status === 'running' ? '● Online' : '○ Offline'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground font-mono">{vpsConfig.outbound_ip || 'No IP'}</p>
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

      {/* Stats Bar */}
      <div className="flex items-center gap-4 mb-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Clock className="w-4 h-4" />
          <span>Uptime: {formatUptime(currentMetric?.uptime_seconds)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity className="w-4 h-4" />
          <span>Latency: {currentMetric?.latency_ms ?? 'N/A'}ms</span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* CPU */}
        <div className="p-4 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium">CPU</span>
          </div>
          <div className="text-2xl font-bold mb-2">{currentMetric?.cpu_percent ?? 0}%</div>
          <Progress 
            value={currentMetric?.cpu_percent ?? 0} 
            className="h-2"
          />
        </div>

        {/* RAM */}
        <div className="p-4 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium">RAM</span>
          </div>
          <div className="text-2xl font-bold mb-2">{currentMetric?.ram_percent ?? 0}%</div>
          <Progress 
            value={currentMetric?.ram_percent ?? 0} 
            className="h-2"
          />
        </div>

        {/* Disk */}
        <div className="p-4 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium">Disk</span>
          </div>
          <div className="text-2xl font-bold mb-2">{currentMetric?.disk_percent ?? 0}%</div>
          <Progress 
            value={currentMetric?.disk_percent ?? 0} 
            className="h-2"
          />
        </div>

        {/* Network */}
        <div className="p-4 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <Wifi className="w-4 h-4 text-green-400" />
            <span className="text-sm font-medium">Network</span>
          </div>
          <div className="text-sm">
            <span className="text-green-400">↓ {currentMetric?.network_in_mbps?.toFixed(1) ?? 0}</span>
            <span className="text-muted-foreground mx-1">/</span>
            <span className="text-blue-400">↑ {currentMetric?.network_out_mbps?.toFixed(1) ?? 0}</span>
            <span className="text-muted-foreground ml-1">Mbps</span>
          </div>
        </div>
      </div>

      {/* Network Chart */}
      {metricsHistory.length > 0 && (
        <div className="p-4 rounded-lg bg-secondary/20 mb-4">
          <h4 className="text-sm font-medium mb-3">Network Traffic (Recent)</h4>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metricsHistory}>
                <XAxis dataKey="time" hide />
                <YAxis hide domain={[0, 'auto']} />
                <Tooltip 
                  contentStyle={{ 
                    background: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="netIn" 
                  stroke="hsl(var(--success))" 
                  strokeWidth={2} 
                  dot={false}
                  name="Download"
                />
                <Line 
                  type="monotone" 
                  dataKey="netOut" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2} 
                  dot={false}
                  name="Upload"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1">
          <Terminal className="w-4 h-4 mr-2" />
          SSH Terminal
        </Button>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          Health Check
        </Button>
      </div>
    </div>
  );
}
