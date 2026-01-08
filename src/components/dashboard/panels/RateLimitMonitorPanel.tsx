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
  status: 'ok' | 'warning' | 'critical';
}

const SERVICE_LIMITS: Record<string, { limit: number; label: string }> = {
  binance: { limit: 1200, label: 'Binance' },
  okx: { limit: 3000, label: 'OKX' },
  kucoin: { limit: 2000, label: 'KuCoin' },
  bybit: { limit: 2500, label: 'Bybit' },
  groq: { limit: 30, label: 'Groq' },
};

interface RateLimitMonitorPanelProps {
  compact?: boolean;
}

export function RateLimitMonitorPanel({ compact = false }: RateLimitMonitorPanelProps) {
  const [stats, setStats] = useState<RateLimitStats[]>([]);

  const updateStats = useCallback(async () => {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);
    
    try {
      const { data: logs } = await supabase
        .from('api_request_logs')
        .select('exchange_name')
        .gte('request_time', oneMinuteAgo.toISOString());
      
      const counts: Record<string, number> = {};
      if (logs) {
        for (const log of logs) {
          const service = log.exchange_name.toLowerCase();
          counts[service] = (counts[service] || 0) + 1;
        }
      }
      
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
          status,
        };
      });

      setStats(newStats);
    } catch (err) {
      console.error('Failed to fetch rate limit stats:', err);
    }
  }, []);

  useEffect(() => {
    updateStats();
    const interval = setInterval(updateStats, 5000);
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
      case 'critical': return <AlertTriangle className="w-2.5 h-2.5" />;
      case 'warning': return <AlertTriangle className="w-2.5 h-2.5" />;
      default: return <CheckCircle className="w-2.5 h-2.5" />;
    }
  };

  return (
    <div className={`glass-card ${compact ? 'p-2' : 'p-3'} h-full flex flex-col`}>
      <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Activity className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} text-primary`} />
          <span className={`font-medium ${compact ? 'text-xs' : 'text-sm'}`}>API Limits</span>
        </div>
        <Badge variant="outline" className={compact ? "text-[8px] h-4 px-1" : "text-xs"}>
          <Zap className="w-2 h-2 mr-0.5" />
          Live
        </Badge>
      </div>

      <div className={`grid ${compact ? 'grid-cols-5 gap-1' : 'grid-cols-5 gap-2'} flex-1`}>
        {stats.map((stat) => (
          <div 
            key={stat.service} 
            className={cn(
              `${compact ? 'p-1' : 'p-2'} rounded-lg bg-secondary/30 border`,
              stat.status === 'critical' && 'border-destructive/50',
              stat.status === 'warning' && 'border-warning/50',
              stat.status === 'ok' && 'border-border/30'
            )}
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className={`font-medium truncate ${compact ? 'text-[9px]' : 'text-xs'}`}>
                {compact ? stat.label.slice(0, 3) : stat.label}
              </span>
              <span className={cn("flex items-center", getStatusColor(stat.status))}>
                {getStatusIcon(stat.status)}
              </span>
            </div>
            <Progress 
              value={stat.usagePercent} 
              className={compact ? "h-1" : "h-1.5"}
            />
            <div className={`text-center ${compact ? 'text-[8px]' : 'text-[10px]'} text-muted-foreground mt-0.5`}>
              {Math.round(stat.usagePercent)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
