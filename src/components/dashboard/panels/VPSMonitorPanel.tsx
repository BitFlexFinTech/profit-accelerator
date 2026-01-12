import { useState, useEffect } from 'react';
import { Server, RefreshCw, Cpu, HardDrive, Activity, Wifi, Clock, Terminal, Plus } from 'lucide-react';
import { SSHTerminalModal } from '@/components/vps/SSHTerminalModal';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useVPSMetrics } from '@/hooks/useVPSMetrics';
import { useVPSInstances } from '@/hooks/useVPSInstances';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip, CartesianGrid } from 'recharts';
import { RegisterExistingVPS } from '@/components/vps/RegisterExistingVPS';
import { cn } from '@/lib/utils';
import { StatusDot } from '@/components/ui/StatusDot';
import { CHART_COLORS, chartStyles } from '@/lib/chartTheme';

interface VPSConfig {
  id: string;
  provider: string;
  region: string;
  status: string;
  outbound_ip: string | null;
}

export function VPSMonitorPanel() {
  const { metrics, isLoading, refetch } = useVPSMetrics();
  const { instances, refetch: refetchInstances } = useVPSInstances();
  const [vpsConfig, setVpsConfig] = useState<VPSConfig | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [showSSHTerminal, setShowSSHTerminal] = useState(false);

  useEffect(() => {
    fetchVPSConfig();
    fetchMetricsHistory();
  }, []);

  const fetchVPSConfig = async () => {
    const { data: instanceData } = await supabase
      .from('vps_instances')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (instanceData) {
      setVpsConfig({
        id: instanceData.id,
        provider: instanceData.provider,
        region: instanceData.region || 'unknown',
        status: instanceData.status || 'unknown',
        outbound_ip: instanceData.ip_address,
      });
      return;
    }

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
        body: { provider: vpsConfig?.provider || 'vultr' }
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

  const handleRegisterSuccess = () => {
    fetchVPSConfig();
    refetchInstances();
  };

  const currentMetric = metrics.find(m => m.provider === vpsConfig?.provider) || metrics[0];

  const formatUptime = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  };

  if (!vpsConfig && instances.length === 0) {
    return (
      <TooltipProvider>
        <div className="card-orange p-6 transition-all duration-300 hover:scale-[1.01]">
          <div className="flex items-center gap-3 mb-4">
            <div className="icon-container-orange">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold">VPS Monitor</h3>
              <p className="text-sm text-muted-foreground">No VPS configured</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Register an existing VPS or deploy a new one to start monitoring.
          </p>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={() => setShowRegisterDialog(true)} className="w-full bg-orange-500 hover:bg-orange-600 transition-all duration-300">
                <Plus className="w-4 h-4 mr-2" />
                Register Existing VPS
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Add your existing VPS server for monitoring</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <RegisterExistingVPS
          open={showRegisterDialog}
          onOpenChange={setShowRegisterDialog}
          onSuccess={handleRegisterSuccess}
          defaultIp="107.191.61.107"
          defaultProvider="vultr"
        />
        <SSHTerminalModal
          open={showSSHTerminal}
          onOpenChange={setShowSSHTerminal}
          ipAddress=""
          provider=""
        />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="card-orange p-6 transition-all duration-300 hover:scale-[1.01]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="icon-container-orange animate-float">
              <Server className="w-5 h-5" />
            </div>
            <div>
            <div className="flex items-center gap-2">
                <h3 className="font-semibold">
                  {vpsConfig?.provider === 'vultr' ? '🦅' : 
                   vpsConfig?.provider === 'aws' ? '☁️' : 
                   vpsConfig?.provider === 'digitalocean' ? '🌊' : 
                   vpsConfig?.provider === 'contabo' ? '🌏' : 
                   vpsConfig?.provider === 'gcp' ? '🔵' : 
                   vpsConfig?.provider === 'oracle' ? '🔴' : '🖥️'} {vpsConfig?.provider?.toUpperCase() || 'VPS'}
                </h3>
                {/* Status badge with StatusDot component */}
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full flex items-center gap-1.5",
                  vpsConfig?.status === 'running' 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : 'bg-muted text-muted-foreground'
                )}>
                  <StatusDot 
                    color={vpsConfig?.status === 'running' ? 'success' : 'muted'} 
                    pulse={vpsConfig?.status === 'running'} 
                    size="xs" 
                  />
                  {vpsConfig?.status === 'running' ? 'Online' : 'Offline'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground font-mono">{vpsConfig?.outbound_ip || 'No IP'}</p>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="border-orange-400/30 hover:border-orange-400 hover:bg-orange-500/10 transition-all duration-300"
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
                Refresh
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Check VPS health and update metrics</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center gap-4 mb-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-orange-400" />
            <span>Uptime: {formatUptime(currentMetric?.uptime_seconds)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>Latency: {currentMetric?.latency_ms ?? 'N/A'}ms</span>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {/* CPU */}
          <div className="p-4 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-400/20 transition-all duration-300 hover:border-blue-400/40">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-blue-400">CPU</span>
            </div>
            <div className="text-2xl font-bold mb-2 text-blue-300">{currentMetric?.cpu_percent ?? 0}%</div>
            <Progress 
              value={currentMetric?.cpu_percent ?? 0} 
              className="h-2 bg-blue-900/30"
            />
          </div>

          {/* RAM */}
          <div className="p-4 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/10 border border-purple-400/20 transition-all duration-300 hover:border-purple-400/40">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-purple-400">RAM</span>
            </div>
            <div className="text-2xl font-bold mb-2 text-purple-300">{currentMetric?.ram_percent ?? 0}%</div>
            <Progress 
              value={currentMetric?.ram_percent ?? 0} 
              className="h-2 bg-purple-900/30"
            />
          </div>

          {/* Disk */}
          <div className="p-4 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-400/20 transition-all duration-300 hover:border-amber-400/40">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-amber-400">Disk</span>
            </div>
            <div className="text-2xl font-bold mb-2 text-amber-300">{currentMetric?.disk_percent ?? 0}%</div>
            <Progress 
              value={currentMetric?.disk_percent ?? 0} 
              className="h-2 bg-amber-900/30"
            />
          </div>

          {/* Network */}
          <div className="p-4 rounded-lg bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-400/20 transition-all duration-300 hover:border-green-400/40">
            <div className="flex items-center gap-2 mb-2">
              <Wifi className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-green-400">Network</span>
            </div>
            <div className="text-sm">
              <span className="text-green-400">↓ {currentMetric?.network_in_mbps?.toFixed(1) ?? 0}</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="text-cyan-400">↑ {currentMetric?.network_out_mbps?.toFixed(1) ?? 0}</span>
              <span className="text-muted-foreground ml-1">Mbps</span>
            </div>
          </div>
        </div>

        {/* Network Chart - Always render section, show message if no data */}
        <div className="p-4 rounded-lg bg-gradient-to-br from-secondary/30 to-secondary/10 border border-border/30 mb-4">
          <h4 className="text-sm font-medium mb-3 text-orange-300">Network Traffic (Recent)</h4>
          {metricsHistory.length > 0 && metricsHistory.some(m => m.netIn > 0 || m.netOut > 0) ? (
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metricsHistory}>
                  <CartesianGrid {...chartStyles.grid} />
                  <XAxis dataKey="time" hide />
                  <YAxis hide domain={[0, 'auto']} />
                  <RechartsTooltip 
                    contentStyle={chartStyles.tooltip.contentStyle}
                    labelStyle={chartStyles.tooltip.labelStyle}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="netIn" 
                    stroke={CHART_COLORS.success}
                    strokeWidth={chartStyles.line.strokeWidth}
                    dot={false}
                    name="Download"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="netOut" 
                    stroke={CHART_COLORS.secondary}
                    strokeWidth={chartStyles.line.strokeWidth}
                    dot={false}
                    name="Upload"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
              <div className="text-center">
                <Wifi className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Waiting for network telemetry...</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1 border-orange-400/30 hover:border-orange-400 hover:bg-orange-500/10 transition-all duration-300"
                onClick={() => setShowSSHTerminal(true)}
              >
                <Terminal className="w-4 h-4 mr-2" />
                SSH Terminal
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Open SSH terminal to VPS</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={handleRefresh} className="border-orange-400/30 hover:border-orange-400 hover:bg-orange-500/10 transition-all duration-300">
                Health Check
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Run comprehensive VPS health check</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <SSHTerminalModal
          open={showSSHTerminal}
          onOpenChange={setShowSSHTerminal}
          ipAddress={vpsConfig?.outbound_ip || ''}
          provider={vpsConfig?.provider || ''}
        />
      </div>
    </TooltipProvider>
  );
}
