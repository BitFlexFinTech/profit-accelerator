import { useState, useEffect, useCallback } from 'react';
import { Activity, AlertTriangle, CheckCircle, Zap } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface RateLimitStats {
  service: string;
  label: string;
  requestsThisMinute: number;
  limit: number;
  usagePercent: number;
  timeUntilResetMs: number;
  status: 'ok' | 'warning' | 'critical';
}

const SERVICE_LIMITS: Record<string, { limit: number; label: string }> = {
  binance: { limit: 1200, label: 'Binance' },
  okx: { limit: 3000, label: 'OKX' },
  kucoin: { limit: 2000, label: 'KuCoin' },
  bybit: { limit: 2500, label: 'Bybit' },
  groq: { limit: 30, label: 'Groq AI' },
};

export function RateLimitMonitorPanel() {
  const [stats, setStats] = useState<RateLimitStats[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Fetch actual API request logs from database
  const updateStats = useCallback(async () => {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);
    
    try {
      // Query api_request_logs from the last minute, grouped by exchange
      const { data: logs } = await supabase
        .from('api_request_logs')
        .select('exchange_name')
        .gte('request_time', oneMinuteAgo.toISOString());
      
      // Count requests per service
      const counts: Record<string, number> = {};
      if (logs) {
        for (const log of logs) {
          const service = log.exchange_name.toLowerCase();
          counts[service] = (counts[service] || 0) + 1;
        }
      }
      
      // Build stats for all monitored services
      const newStats: RateLimitStats[] = Object.entries(SERVICE_LIMITS).map(([service, config]) => {
        const requestsThisMinute = counts[service] || 0;
        const usagePercent = (requestsThisMinute / config.limit) * 100;
        
        let status: 'ok' | 'warning' | 'critical' = 'ok';
        if (usagePercent >= 90) status = 'critical';
        else if (usagePercent >= 70) status = 'warning';

        return {
          service,
          label: config.label,
          requestsThisMinute,
          limit: config.limit,
          usagePercent: Math.min(100, usagePercent),
          timeUntilResetMs: 60000 - (now.getTime() % 60000),
          status,
        };
      });

      setStats(newStats);
      setLastUpdate(now);
    } catch (err) {
      console.error('Failed to fetch rate limit stats:', err);
    }
  }, []);

  useEffect(() => {
    updateStats();
    const interval = setInterval(updateStats, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, [updateStats]);

  const getStatusColor = (status: 'ok' | 'warning' | 'critical') => {
    switch (status) {
      case 'critical': return 'text-destructive';
      case 'warning': return 'text-warning';
      default: return 'text-success';
    }
  };

  const getStatusIcon = (status: 'ok' | 'warning' | 'critical') => {
    switch (status) {
      case 'critical': return <AlertTriangle className="w-3 h-3" />;
      case 'warning': return <AlertTriangle className="w-3 h-3" />;
      default: return <CheckCircle className="w-3 h-3" />;
    }
  };

  const getProgressColor = (usagePercent: number) => {
    if (usagePercent >= 90) return 'bg-destructive';
    if (usagePercent >= 70) return 'bg-warning';
    return 'bg-success';
  };

  return (
    <div className="glass-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">API Rate Limits</span>
        </div>
        <Badge variant="outline" className="text-xs">
          <Zap className="w-3 h-3 mr-1" />
          Live
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {stats.map((stat) => (
          <div 
            key={stat.service} 
            className={cn(
              "p-2 rounded-lg bg-secondary/30 border",
              stat.status === 'critical' && 'border-destructive/50 animate-pulse',
              stat.status === 'warning' && 'border-warning/50',
              stat.status === 'ok' && 'border-border/30'
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium truncate">{stat.label}</span>
              <span className={cn("flex items-center gap-0.5", getStatusColor(stat.status))}>
                {getStatusIcon(stat.status)}
              </span>
            </div>
            <Progress 
              value={stat.usagePercent} 
              className="h-1.5 mb-1"
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{stat.requestsThisMinute}/{stat.limit}</span>
              <span>{Math.round(stat.usagePercent)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Utility function to record an API call (to be used throughout the app)
export function recordApiCall(service: 'binance' | 'okx' | 'groq' | 'vultr' | 'digitalocean') {
  const now = Date.now();
  const storedKey = `rateLimit_${service}`;
  const stored = localStorage.getItem(storedKey);
  
  let count = 1;
  let timestamp = now;
  
  if (stored) {
    const parsed = JSON.parse(stored);
    if (now - parsed.timestamp < 60000) {
      count = parsed.count + 1;
      timestamp = parsed.timestamp;
    }
  }
  
  localStorage.setItem(storedKey, JSON.stringify({ count, timestamp }));
}
