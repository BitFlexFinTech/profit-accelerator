import { useState, useEffect } from 'react';
import { Activity, AlertTriangle, CheckCircle2, XCircle, RefreshCw, HelpCircle, Server, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface ExchangePulse {
  id: string;
  exchange_name: string;
  status: 'healthy' | 'jitter' | 'error';
  latency_ms: number;
  last_check: string;
  error_message: string | null;
  region: string;
  source?: 'edge' | 'vps';
}

const EXCHANGE_DISPLAY: Record<string, { name: string; color: string }> = {
  binance: { name: 'Binance', color: 'bg-yellow-500' },
  okx: { name: 'OKX', color: 'bg-gray-100' },
  bybit: { name: 'Bybit', color: 'bg-orange-500' },
  bitget: { name: 'Bitget', color: 'bg-cyan-500' },
  bingx: { name: 'BingX', color: 'bg-blue-500' },
  mexc: { name: 'MEXC', color: 'bg-blue-600' },
  gateio: { name: 'Gate.io', color: 'bg-blue-400' },
  kucoin: { name: 'KuCoin', color: 'bg-green-500' },
  kraken: { name: 'Kraken', color: 'bg-purple-500' },
  nexo: { name: 'Nexo', color: 'bg-blue-700' },
  hyperliquid: { name: 'Hyperliquid', color: 'bg-emerald-500' },
};

export function ExchangePulsePanel() {
  const [pulses, setPulses] = useState<ExchangePulse[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPingingVPS, setIsPingingVPS] = useState(false);
  const [selectedPulse, setSelectedPulse] = useState<ExchangePulse | null>(null);
  const [showFixGuide, setShowFixGuide] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchPulses();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('exchange-pulse-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'exchange_pulse'
      }, () => {
        fetchPulses();
      })
      .subscribe();

    // Auto-refresh every 30 seconds + ping VPS
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(async () => {
        await supabase.functions.invoke('ping-exchanges-vps');
        await fetchPulses();
      }, 30000);
    }

    return () => {
      supabase.removeChannel(channel);
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const fetchPulses = async () => {
    try {
      const { data, error } = await supabase
        .from('exchange_pulse')
        .select('*')
        .order('exchange_name');

      if (error) throw error;
      setPulses((data as ExchangePulse[]) || []);
    } catch (err) {
      console.error('[ExchangePulsePanel] Error:', err);
    }
  };

  const refreshPulses = async () => {
    setIsRefreshing(true);
    try {
      // Call trade-engine to ping all exchanges from edge
      const { data, error } = await supabase.functions.invoke('trade-engine', {
        body: { action: 'ping-all-exchanges' }
      });

      if (error) throw error;
      
      toast.success(`Refreshed ${data?.checked || 0} exchange pulses`);
      await fetchPulses();
    } catch (err) {
      console.error('[ExchangePulsePanel] Refresh error:', err);
      toast.error('Failed to refresh pulses');
    } finally {
      setIsRefreshing(false);
    }
  };

  const pingFromVPS = async () => {
    setIsPingingVPS(true);
    try {
      const { data, error } = await supabase.functions.invoke('ping-exchanges-vps');
      
      if (error) throw error;
      
      if (data?.success) {
        toast.success(`VPS ping: ${data?.pings?.length || 0} exchanges measured from ${data?.vps_region || 'VPS'}`);
      } else {
        toast.error(data?.error || 'VPS ping failed');
      }
      await fetchPulses();
    } catch (err) {
      console.error('[ExchangePulsePanel] VPS ping error:', err);
      toast.error('Failed to ping from VPS');
    } finally {
      setIsPingingVPS(false);
    }
  };

  // Get VPS latency color thresholds (stricter for VPS since it should be faster)
  const getVPSLatencyColor = (latency: number, source?: string) => {
    if (source === 'vps') {
      // VPS thresholds: <30ms green, 30-80ms yellow, >80ms red
      if (latency < 30) return 'text-green-400';
      if (latency < 80) return 'text-yellow-400';
      return 'text-red-400';
    }
    // Edge thresholds (more lenient): <100ms green, 100-300ms yellow, >300ms red
    if (latency < 100) return 'text-green-400';
    if (latency < 300) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'jitter':
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      default:
        return <XCircle className="w-4 h-4 text-red-400" />;
    }
  };

  const getPulseColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-400';
      case 'jitter':
        return 'bg-yellow-400';
      default:
        return 'bg-red-400';
    }
  };

  const handlePulseClick = (pulse: ExchangePulse) => {
    setSelectedPulse(pulse);
    if (pulse.status === 'error') {
      setShowFixGuide(true);
    }
  };

  const healthyCount = pulses.filter(p => p.status === 'healthy').length;
  const jitterCount = pulses.filter(p => p.status === 'jitter').length;
  const errorCount = pulses.filter(p => p.status === 'error').length;

  const isVPSSource = pulses.some(p => p.source === 'vps');

  return (
    <>
      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary animate-pulse" />
            <h2 className="font-semibold">Exchange Pulse Monitor</h2>
            {isVPSSource && (
              <Badge variant="outline" className="gap-1 text-xs border-green-500/50 text-green-400">
                <Server className="w-3 h-3" />
                VPS
              </Badge>
            )}
            <div className="flex items-center gap-2 ml-4">
              <span className="flex items-center gap-1 text-xs">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                {healthyCount}
              </span>
              <span className="flex items-center gap-1 text-xs">
                <span className="w-2 h-2 rounded-full bg-yellow-400" />
                {jitterCount}
              </span>
              <span className="flex items-center gap-1 text-xs">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                {errorCount}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={pingFromVPS}
              disabled={isPingingVPS}
              className="h-7 px-2 gap-1 text-xs"
            >
              <Zap className={`w-3 h-3 ${isPingingVPS ? 'animate-pulse' : ''}`} />
              Ping from VPS
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshPulses}
              disabled={isRefreshing}
              className="h-7 px-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 p-4">
          {pulses.map((pulse) => {
            const display = EXCHANGE_DISPLAY[pulse.exchange_name] || { name: pulse.exchange_name, color: 'bg-gray-500' };
            
            return (
              <button
                key={pulse.id}
                onClick={() => handlePulseClick(pulse)}
                className={`p-3 rounded-lg border transition-all hover:scale-105 active:scale-95 ${
                  pulse.status === 'healthy' 
                    ? 'bg-green-500/10 border-green-500/30 hover:border-green-500' 
                    : pulse.status === 'jitter'
                    ? 'bg-yellow-500/10 border-yellow-500/30 hover:border-yellow-500'
                    : 'bg-red-500/10 border-red-500/30 hover:border-red-500'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`w-2 h-2 rounded-full ${getPulseColor(pulse.status)} ${pulse.status === 'healthy' ? 'animate-pulse' : ''}`} />
                  {getStatusIcon(pulse.status)}
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">{display.name}</p>
                  <div className="flex items-center gap-1">
                    <p className={`text-xs font-mono ${getVPSLatencyColor(pulse.latency_ms, pulse.source)}`}>
                      {Math.round(pulse.latency_ms)}ms
                    </p>
                    {pulse.source === 'vps' && (
                      <Server className="w-2.5 h-2.5 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="px-4 pb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          {isVPSSource ? (
            <>
              <span className="flex items-center gap-1">
                <Server className="w-3 h-3" />
                VPS → Exchange
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-400" /> 
                Fast (&lt;30ms)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-400" /> 
                Normal (30-80ms)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400" /> 
                Slow (&gt;80ms)
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-400" /> 
                Healthy (&lt;100ms)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-400" /> 
                Jitter (100-300ms)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400" /> 
                Error (&gt;300ms)
              </span>
            </>
          )}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded ${autoRefresh ? 'bg-green-500/20 text-green-400' : 'bg-secondary'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-green-400 animate-pulse' : 'bg-muted-foreground'}`} />
            Auto {autoRefresh ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* RTT Details Dialog */}
      <Dialog open={!!selectedPulse && !showFixGuide} onOpenChange={() => setSelectedPulse(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getStatusIcon(selectedPulse?.status || 'error')}
              {EXCHANGE_DISPLAY[selectedPulse?.exchange_name || '']?.name || selectedPulse?.exchange_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground">Round Trip Time</p>
                <p className={`text-2xl font-bold ${
                  (selectedPulse?.latency_ms || 0) < 20 ? 'text-green-400' :
                  (selectedPulse?.latency_ms || 0) < 50 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {selectedPulse?.latency_ms}ms
                </p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground">Status</p>
                <p className={`text-lg font-semibold capitalize ${
                  selectedPulse?.status === 'healthy' ? 'text-green-400' :
                  selectedPulse?.status === 'jitter' ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {selectedPulse?.status}
                </p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground">Region</p>
              <p className="font-mono text-sm">{selectedPulse?.region}</p>
            </div>
            {selectedPulse?.error_message && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-xs text-red-400 font-semibold mb-1">Error Message</p>
                <p className="text-sm">{selectedPulse.error_message}</p>
              </div>
            )}
            {selectedPulse?.status === 'error' && (
              <Button 
                variant="outline" 
                className="w-full gap-2"
                onClick={() => setShowFixGuide(true)}
              >
                <HelpCircle className="w-4 h-4" />
                View Fix Guide
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Fix Guide Dialog */}
      <Dialog open={showFixGuide} onOpenChange={setShowFixGuide}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Fix Guide: {EXCHANGE_DISPLAY[selectedPulse?.exchange_name || '']?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-secondary/30">
              <h4 className="font-semibold mb-2">Common Issues & Solutions</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400">1.</span>
                  <span><strong>API Rate Limit:</strong> Reduce request frequency or use WebSocket</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400">2.</span>
                  <span><strong>IP Not Whitelisted:</strong> Add your VPS IP to exchange API settings</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400">3.</span>
                  <span><strong>Invalid Credentials:</strong> Regenerate API keys from exchange</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400">4.</span>
                  <span><strong>Region Mismatch:</strong> Ensure VPS is in {selectedPulse?.region} region</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400">5.</span>
                  <span><strong>Network Issues:</strong> Check VPS firewall allows outbound HTTPS</span>
                </li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
              <h4 className="font-semibold mb-2">Quick Actions</h4>
              <div className="space-y-2">
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => {
                  toast.info('Checking VPS health...');
                  supabase.functions.invoke('check-vps-health', { body: {} });
                }}>
                  Check VPS Health
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => {
                  toast.info('Syncing IP whitelist...');
                  supabase.functions.invoke('sync-ip-whitelist', { body: {} });
                }}>
                  Sync IP Whitelist
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
