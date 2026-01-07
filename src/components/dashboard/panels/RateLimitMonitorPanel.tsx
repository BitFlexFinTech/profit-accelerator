import { useState, useEffect, useCallback } from 'react';
import { Activity, AlertTriangle, CheckCircle, Zap } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface RateLimitStats {
  service: string;
  label: string;
  requestsThisMinute: number;
  limit: number;
  usagePercent: number;
  timeUntilResetMs: number;
  status: 'ok' | 'warning' | 'critical';
}

const SERVICE_LIMITS = {
  binance: { limit: 1200, label: 'Binance' },
  okx: { limit: 3000, label: 'OKX' },
  groq: { limit: 30, label: 'Groq AI' },
  vultr: { limit: 100, label: 'Vultr' },
  digitalocean: { limit: 250, label: 'DigitalOcean' },
};

export function RateLimitMonitorPanel() {
  const [stats, setStats] = useState<RateLimitStats[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Simulate rate limit tracking (in production, this would come from actual API call tracking)
  const updateStats = useCallback(() => {
    const now = Date.now();
    const newStats: RateLimitStats[] = Object.entries(SERVICE_LIMITS).map(([service, config]) => {
      // Get simulated usage from localStorage or start fresh
      const storedKey = `rateLimit_${service}`;
      const stored = localStorage.getItem(storedKey);
      let requestsThisMinute = 0;
      
      if (stored) {
        const parsed = JSON.parse(stored);
        // Reset if more than 1 minute old
        if (now - parsed.timestamp < 60000) {
          requestsThisMinute = parsed.count;
        }
      }

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
        timeUntilResetMs: stored ? Math.max(0, 60000 - (now - JSON.parse(stored).timestamp)) : 60000,
        status,
      };
    });

    setStats(newStats);
    setLastUpdate(new Date());
  }, []);

  useEffect(() => {
    updateStats();
    const interval = setInterval(updateStats, 1000);
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
