import { useState, useEffect } from 'react';
import { 
  Shield, 
  Server, 
  RefreshCw, 
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Stethoscope
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { VPSHealthDisplay } from './VPSHealthDisplay';
import { StatusDot, StatusDotColor } from '@/components/ui/StatusDot';

interface FailoverConfig {
  id: string;
  provider: string;
  priority: number;
  is_primary: boolean | null;
  is_enabled: boolean | null;
  health_check_url: string | null;
  timeout_ms: number | null;
}

interface FailoverEvent {
  id: string;
  from_provider: string;
  to_provider: string;
  reason: string | null;
  triggered_at: string | null;
  resolved_at: string | null;
}

interface HealthStatus {
  provider: string;
  status: 'healthy' | 'warning' | 'down' | 'checking';
  latency: number;
  lastCheck: Date;
}

interface VPSMetrics {
  uptime?: number;
  memory?: {
    total: number;
    free: number;
    used: number;
    percent: number;
  };
  cpu?: number[];
  hostname?: string;
  platform?: string;
  version?: string;
}

interface HealthTestResult {
  success: boolean;
  status: 'ok' | 'error' | 'down' | 'checking';
  latency: number;
  metrics?: VPSMetrics;
  error?: string;
  hint?: string;
}

export function FailoverStatusPanel() {
  const [configs, setConfigs] = useState<FailoverConfig[]>([]);
  const [events, setEvents] = useState<FailoverEvent[]>([]);
  const [healthStatuses, setHealthStatuses] = useState<Map<string, HealthStatus>>(new Map());
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [healthTestResult, setHealthTestResult] = useState<HealthTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const fetchData = async () => {
    const [configRes, eventRes] = await Promise.all([
      supabase.from('failover_config').select('*').order('priority'),
      supabase.from('failover_events').select('*').order('triggered_at', { ascending: false }).limit(5),
    ]);

    if (configRes.data) setConfigs(configRes.data);
    if (eventRes.data) setEvents(eventRes.data);
  };

  useEffect(() => {
    fetchData();
    // Fetch real health check results from database
    fetchHealthStatuses();

    // Health check every 30 seconds
    const interval = setInterval(() => {
      runHealthCheck();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const fetchHealthStatuses = async () => {
    try {
      const { data } = await supabase
        .from('health_check_results')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (data && data.length > 0) {
        const newStatuses = new Map<string, HealthStatus>();
        data.forEach(result => {
          if (result.provider && !newStatuses.has(result.provider)) {
            newStatuses.set(result.provider, {
              provider: result.provider,
              status: result.status === 'ok' ? 'healthy' : result.status === 'warning' ? 'warning' : 'down',
              latency: (result.details as any)?.latency || 0,
              lastCheck: new Date(result.created_at || Date.now()),
            });
          }
        });
        if (newStatuses.size > 0) {
          setHealthStatuses(newStatuses);
        }
      }
    } catch (err) {
      console.error('Failed to fetch health statuses:', err);
    }
  };

  const runHealthCheck = async () => {
    setIsChecking(true);
    
    try {
      // Call real health check edge function
      const { data, error } = await supabase.functions.invoke('check-vps-health', {
        body: { action: 'check-all' }
      });

      if (error) throw error;

      if (data?.results) {
        const newStatuses = new Map<string, HealthStatus>();
        Object.entries(data.results).forEach(([provider, result]: [string, any]) => {
          newStatuses.set(provider, {
            provider,
            status: result.status === 'ok' ? 'healthy' : result.status === 'warning' ? 'warning' : 'down',
            latency: result.latency || 0,
            lastCheck: new Date(),
          });
        });
        setHealthStatuses(newStatuses);
      }
      
      setLastCheck(new Date());
    } catch (err) {
      console.error('Health check failed:', err);
      // Refresh from database on failure
      fetchHealthStatuses();
    } finally {
      setIsChecking(false);
    }
  };

  const testHealthEndpoint = async () => {
    setIsTesting(true);
    setHealthTestResult({ success: false, status: 'checking', latency: 0 });
    
    try {
      const { data, error } = await supabase.functions.invoke('health-check-test', {
        body: { url: 'http://167.179.83.239:8080/health', timeout: 10000 }
      });

      if (error) {
        setHealthTestResult({
          success: false,
          status: 'error',
          latency: 0,
          error: error.message
        });
        toast.error('Health check failed');
        return;
      }

      setHealthTestResult({
        success: data.success,
        status: data.success ? 'ok' : 'down',
        latency: data.latency || 0,
        metrics: data.metrics,
        error: data.error,
        hint: data.hint
      });

      if (data.success) {
        toast.success(`HFT Bot is online (${data.latency}ms)`);
        // Update vultr status with real data
        setHealthStatuses(prev => {
          const newMap = new Map(prev);
          newMap.set('vultr', {
            provider: 'vultr',
            status: data.latency < 100 ? 'healthy' : data.latency < 300 ? 'warning' : 'down',
            latency: data.latency,
            lastCheck: new Date()
          });
          return newMap;
        });
      } else {
        toast.error(data.error || 'Health endpoint unreachable');
      }
    } catch (err) {
      setHealthTestResult({
        success: false,
        status: 'error',
        latency: 0,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
      toast.error('Failed to test health endpoint');
    } finally {
      setIsTesting(false);
    }
  };

  const handleManualSwitch = async (toProvider: string) => {
    const primaryConfig = configs.find(c => c.is_primary);
    if (!primaryConfig || primaryConfig.provider === toProvider) return;

    toast.loading('Switching primary server...');
    
    // Update configs
    await supabase.from('failover_config').update({ is_primary: false }).eq('is_primary', true);
    await supabase.from('failover_config').update({ is_primary: true }).eq('provider', toProvider);
    
    // Log event
    await supabase.from('failover_events').insert({
      from_provider: primaryConfig.provider,
      to_provider: toProvider,
      reason: 'manual',
      is_automatic: false,
    });

    toast.dismiss();
    toast.success(`Switched to ${toProvider}`);
    fetchData();
  };

  const primaryServer = configs.find(c => c.is_primary) || { provider: 'vultr', is_primary: true };
  const backupServers = configs.filter(c => !c.is_primary && c.is_enabled);

  const getStatusDotColor = (status: string): StatusDotColor => {
    switch (status) {
      case 'healthy': return 'success';
      case 'warning': return 'warning';
      case 'down': return 'destructive';
      default: return 'muted';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500/20 text-green-500 border-green-500/50';
      case 'warning': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50';
      case 'down': return 'bg-red-500/20 text-red-500 border-red-500/50';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const formatTime = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };

  return (
    <div className="glass-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h3 className="font-semibold">VPS Failover</h3>
            <p className="text-xs text-muted-foreground">
              {lastCheck ? `Last check: ${formatTime(lastCheck)}` : 'Health checks every 30s'}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={runHealthCheck} disabled={isChecking}>
          <RefreshCw className={`w-4 h-4 mr-1 ${isChecking ? 'animate-spin' : ''}`} />
          Check Now
        </Button>
      </div>

      {/* Primary Server */}
      <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            <span className="font-medium">PRIMARY</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusDot 
              color={getStatusDotColor(healthStatuses.get(primaryServer.provider)?.status || 'healthy')} 
              pulse={healthStatuses.get(primaryServer.provider)?.status === 'healthy'} 
              size="sm" 
            />
            <Badge variant="outline" className={getStatusColor(
              healthStatuses.get(primaryServer.provider)?.status || 'healthy'
            )}>
              <span>{(healthStatuses.get(primaryServer.provider)?.status || 'healthy').toUpperCase()}</span>
            </Badge>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold capitalize">{primaryServer.provider} Tokyo</p>
            <p className="text-xs text-muted-foreground">167.179.83.239</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-mono">
              {healthStatuses.get(primaryServer.provider)?.latency || 18}ms
            </p>
            <p className="text-xs text-muted-foreground">latency</p>
          </div>
        </div>
        
        {/* Test Health Button */}
        <div className="mt-3 pt-3 border-t border-primary/20">
          <Button 
            size="sm" 
            variant="outline" 
            className="w-full"
            onClick={testHealthEndpoint}
            disabled={isTesting}
          >
            <Stethoscope className={`w-4 h-4 mr-2 ${isTesting ? 'animate-pulse' : ''}`} />
            {isTesting ? 'Testing Health Endpoint...' : 'Test HFT Bot Health'}
          </Button>
        </div>
      </div>

      {/* Health Test Result */}
      {healthTestResult && (
        <VPSHealthDisplay 
          status={healthTestResult.status}
          latency={healthTestResult.latency}
          metrics={healthTestResult.metrics}
          error={healthTestResult.error}
          hint={healthTestResult.hint}
        />
      )}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">BACKUP SERVERS</p>
        
        {(backupServers.length > 0 ? backupServers : [
          { id: '1', provider: 'oracle', priority: 2, is_enabled: true },
          { id: '2', provider: 'aws', priority: 3, is_enabled: true },
        ]).map((server) => (
          <div 
            key={server.id} 
            className="p-3 rounded-lg bg-secondary/30 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded bg-muted flex items-center justify-center text-xs font-bold">
                {server.priority}
              </div>
              <div>
                <p className="font-medium capitalize">{server.provider} Tokyo</p>
                <p className="text-xs text-muted-foreground">STANDBY</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <StatusDot 
                  color={getStatusDotColor(healthStatuses.get(server.provider)?.status || 'healthy')} 
                  pulse={healthStatuses.get(server.provider)?.status === 'healthy'} 
                  size="xs" 
                />
                <Badge variant="outline" className={getStatusColor(
                  healthStatuses.get(server.provider)?.status || 'healthy'
                )}>
                  <span>{healthStatuses.get(server.provider)?.latency || 22}ms</span>
                </Badge>
              </div>
              
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => handleManualSwitch(server.provider)}
              >
                <ArrowRightLeft className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Events */}
      {events.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">RECENT EVENTS</p>
          <div className="space-y-1">
            {events.slice(0, 3).map((event) => (
              <div key={event.id} className="flex items-center gap-2 text-xs">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {event.triggered_at ? new Date(event.triggered_at).toLocaleDateString() : 'Recent'}
                </span>
                <span>
                  {event.from_provider} → {event.to_provider}
                </span>
                <Badge variant="outline" className="text-xs">
                  {event.reason || 'manual'}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
