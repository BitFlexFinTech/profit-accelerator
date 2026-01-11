import { TrendingUp, TrendingDown, DollarSign, Activity, AlertCircle, Clock, Server, Cloud, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore } from '@/store/useAppStore';
import { useTradesRealtime } from '@/hooks/useTradesRealtime';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusDot } from '@/components/ui/StatusDot';
import { getStatusDotColor } from '@/lib/statusColors';

interface InfraStatus {
  provider: string;
  status: string;
  region: string | null;
  latencyMs: number | null;
}

export function CompactMetricsBar() {
  // Use SSOT store for equity - single source of truth
  const { 
    getTotalEquity, 
    getConnectedExchangeCount, 
    dailyPnl, 
    weeklyPnl, 
    isLoading: storeLoading,
    lastUpdate
  } = useAppStore();
  
  // Use unified trades hook - single source of truth for trade data
  const { totalTrades, openCount, loading: tradesLoading } = useTradesRealtime();
  
  const totalBalance = getTotalEquity();
  const exchangeCount = getConnectedExchangeCount();
  const isLive = lastUpdate > Date.now() - 60000; // Consider live if updated in last minute
  
  // Infrastructure status state
  const [infraStatus, setInfraStatus] = useState<InfraStatus | null>(null);
  const [infraLoading, setInfraLoading] = useState(true);
  
  // CRITICAL FIX: Cache last known good values to prevent "Not Connected" flash on tab switch
  const cachedValues = useRef({
    totalBalance: 0,
    dailyPnl: 0,
    weeklyPnl: 0,
    lastUpdated: 0
  });
  
  // Update cache when real data arrives
  useEffect(() => {
    if (totalBalance > 0 || dailyPnl !== 0 || weeklyPnl !== 0) {
      cachedValues.current = {
        totalBalance,
        dailyPnl,
        weeklyPnl,
        lastUpdated: Date.now()
      };
    }
  }, [totalBalance, dailyPnl, weeklyPnl]);
  
  // Fetch infrastructure status
  useEffect(() => {
    const fetchInfra = async () => {
      try {
        // Get active VPS/cloud provider
        const { data: deployment } = await supabase
          .from('hft_deployments')
          .select('provider, status, region, ip_address')
          .in('status', ['active', 'running'])
          .limit(1)
          .single();
        
        if (deployment) {
          // Get average VPS latency
          const { data: pulseData } = await supabase
            .from('exchange_pulse')
            .select('latency_ms')
            .eq('source', 'vps')
            .gt('latency_ms', 0);
          
          const avgLatency = pulseData?.length 
            ? Math.round(pulseData.reduce((sum, p) => sum + (p.latency_ms || 0), 0) / pulseData.length)
            : null;
          
          setInfraStatus({
            provider: deployment.provider,
            status: deployment.status || 'unknown',
            region: deployment.region,
            latencyMs: avgLatency
          });
        } else {
          // Check cloud_config for configured providers
          const { data: cloudConfig } = await supabase
            .from('cloud_config')
            .select('provider, status, region')
            .eq('is_active', true)
            .limit(1)
            .single();
          
          if (cloudConfig) {
            setInfraStatus({
              provider: cloudConfig.provider,
              status: cloudConfig.status || 'configured',
              region: cloudConfig.region,
              latencyMs: null
            });
          }
        }
      } catch (err) {
        console.error('[CompactMetricsBar] Infra fetch error:', err);
      } finally {
        setInfraLoading(false);
      }
    };

    fetchInfra();
    const interval = setInterval(fetchInfra, 30000);
    return () => clearInterval(interval);
  }, []);
  
  // Use cached values during loading to prevent "Not Connected" flash
  const displayBalance = totalBalance > 0 ? totalBalance : cachedValues.current.totalBalance;
  const displayDailyPnl = totalBalance > 0 ? dailyPnl : cachedValues.current.dailyPnl;
  const displayWeeklyPnl = totalBalance > 0 ? weeklyPnl : cachedValues.current.weeklyPnl;
  
  // Calculate data freshness
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const secondsAgo = Math.max(0, Math.floor((now - lastUpdate) / 1000));
  const isStale = secondsAgo > 120; // Stale if > 2 minutes

  const dailyPercent = displayBalance > 0 ? (displayDailyPnl / displayBalance) * 100 : 0;
  const weeklyPercent = displayBalance > 0 ? (displayWeeklyPnl / displayBalance) * 100 : 0;
  
  // CRITICAL FIX: Only show "Not Connected" if we have NO cached data AND not loading
  const hasNoData = displayBalance === 0 && !storeLoading && cachedValues.current.lastUpdated === 0;
  const localLoading = tradesLoading;

  const getProviderLabel = (provider: string) => {
    const labels: Record<string, string> = {
      vultr: 'Vultr', contabo: 'Contabo', aws: 'AWS', 
      digitalocean: 'DO', gcp: 'GCP', oracle: 'Oracle',
      alibaba: 'Alibaba', azure: 'Azure'
    };
    return labels[provider.toLowerCase()] || provider;
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn(
        "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2",
        isStale && "ring-1 ring-warning/30 rounded-lg"
      )}>
        {/* Today's P&L */}
        <div className="glass-card p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Today</span>
            <DollarSign className="w-3 h-3 text-success" />
          </div>
          {storeLoading ? (
            <Skeleton className="h-6 w-20" />
          ) : hasNoData ? (
            <div className="flex items-center gap-1 text-muted-foreground">
              <AlertCircle className="w-3 h-3" />
              <span className="text-xs">Not Connected</span>
            </div>
          ) : displayDailyPnl === 0 && openCount === 0 ? (
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold text-muted-foreground">$0</span>
              <span className="text-[10px] text-muted-foreground">No trades</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className={`text-lg font-bold ${displayDailyPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                {displayDailyPnl >= 0 ? '+' : ''}${Math.abs(displayDailyPnl).toFixed(0)}
              </span>
              <span className={`text-[10px] ${displayDailyPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                ({dailyPercent >= 0 ? '+' : ''}{dailyPercent.toFixed(1)}%)
              </span>
            </div>
          )}
        </div>

        {/* Weekly P&L */}
        <div className="glass-card p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Week</span>
            {displayWeeklyPnl >= 0 ? (
              <TrendingUp className="w-3 h-3 text-success" />
            ) : (
              <TrendingDown className="w-3 h-3 text-destructive" />
            )}
          </div>
          {storeLoading ? (
            <Skeleton className="h-6 w-20" />
          ) : hasNoData ? (
            <div className="flex items-center gap-1 text-muted-foreground">
              <AlertCircle className="w-3 h-3" />
              <span className="text-xs">Not Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className={`text-lg font-bold ${displayWeeklyPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                {displayWeeklyPnl >= 0 ? '+' : ''}${Math.abs(displayWeeklyPnl).toFixed(0)}
              </span>
              <span className={`text-[10px] ${displayWeeklyPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                ({weeklyPercent >= 0 ? '+' : ''}{weeklyPercent.toFixed(1)}%)
              </span>
            </div>
          )}
        </div>

        {/* Total Equity */}
        <div className="glass-card p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Equity</span>
              {isLive && (
                <StatusDot color="success" pulse size="xs" />
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "flex items-center gap-0.5 cursor-help",
                  isStale ? "text-warning" : "text-muted-foreground"
                )}>
                  <Clock className="w-2.5 h-2.5" />
                  <span className="text-[9px]">
                    {secondsAgo < 60 ? `${secondsAgo}s` : `${Math.floor(secondsAgo / 60)}m`}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {isStale ? `Data is stale (last update ${secondsAgo}s ago)` : `Last updated ${secondsAgo}s ago`}
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          {storeLoading ? (
            <Skeleton className="h-6 w-24" />
          ) : hasNoData ? (
            <div className="flex items-center gap-1 text-muted-foreground">
              <AlertCircle className="w-3 h-3" />
              <span className="text-xs">Connect Exchange</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold">
                ${displayBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({exchangeCount}ex)
              </span>
            </div>
          )}
        </div>

        {/* Active Trades */}
        <div className="glass-card p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Trades</span>
            <Activity className="w-3 h-3 text-accent" />
          </div>
          {localLoading ? (
            <Skeleton className="h-6 w-12" />
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold">{totalTrades}</span>
              <span className="text-[10px] text-muted-foreground">
                ({openCount} open)
              </span>
            </div>
          )}
        </div>

        {/* Infrastructure - FAR RIGHT */}
        <div className="glass-card p-3 col-span-2 md:col-span-1">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Cloud className="w-3 h-3 text-orange-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Infra</span>
            </div>
            {infraStatus && (
              <StatusDot 
                color={getStatusDotColor(infraStatus.status)} 
                pulse={infraStatus.status === 'running' || infraStatus.status === 'active'} 
                size="sm" 
              />
            )}
          </div>
          {infraLoading ? (
            <Skeleton className="h-6 w-full" />
          ) : infraStatus ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Server className="w-3 h-3 text-orange-400" />
                <span className="text-sm font-bold">{getProviderLabel(infraStatus.provider)}</span>
              </div>
              {infraStatus.latencyMs !== null && (
                <div className="flex items-center gap-0.5">
                  <Zap className={cn(
                    "w-2.5 h-2.5",
                    infraStatus.latencyMs < 50 ? 'text-emerald-400' : 
                    infraStatus.latencyMs < 100 ? 'text-amber-400' : 'text-red-400'
                  )} />
                  <span className={cn(
                    "text-[10px] font-medium",
                    infraStatus.latencyMs < 50 ? 'text-emerald-400' : 
                    infraStatus.latencyMs < 100 ? 'text-amber-400' : 'text-red-400'
                  )}>
                    {infraStatus.latencyMs}ms
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 text-muted-foreground">
              <AlertCircle className="w-3 h-3" />
              <span className="text-xs">No VPS Active</span>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
