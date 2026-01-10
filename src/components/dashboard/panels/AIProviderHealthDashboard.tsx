import { useState, useEffect } from 'react';
import { Brain, RefreshCw, Zap, Clock, CheckCircle, XCircle, AlertTriangle, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AIProvider {
  id: string;
  provider_name: string;
  display_name: string;
  short_name: string;
  color_hex: string;
  is_enabled: boolean;
  rate_limit_rpm: number;
  current_usage: number;
  rate_limit_rpd: number;
  daily_usage: number;
  cooldown_until: string | null;
  last_used_at: string | null;
  success_count: number;
  error_count: number;
  total_latency_ms: number;
  has_secret: boolean;
  free_tier_info: string | null;
}

// Provider badge colors matching AIMarketUpdatesPanel
const PROVIDER_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  groq: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40' },
  cerebras: { bg: 'bg-teal-500/20', text: 'text-teal-400', border: 'border-teal-500/40' },
  together: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/40' },
  openrouter: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/40' },
  mistral: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/40' },
  gemini: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/40' },
  huggingface: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/40' },
};

export function AIProviderHealthDashboard() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [cooldownTimers, setCooldownTimers] = useState<Record<string, number>>({});

  const fetchProviders = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_providers')
        .select('*')
        .order('priority', { ascending: true });

      if (error) throw error;
      setProviders((data as AIProvider[]) || []);
    } catch (err) {
      console.error('[AIProviderHealthDashboard] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchProviders, 10000);
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel('ai-providers-health')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ai_providers'
      }, () => {
        fetchProviders();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  // Cooldown timer countdown
  useEffect(() => {
    const updateCooldowns = () => {
      const now = Date.now();
      const timers: Record<string, number> = {};
      
      providers.forEach(p => {
        if (p.cooldown_until) {
          const cooldownEnd = new Date(p.cooldown_until).getTime();
          const remaining = Math.max(0, Math.ceil((cooldownEnd - now) / 1000));
          if (remaining > 0) {
            timers[p.provider_name] = remaining;
          }
        }
      });
      
      setCooldownTimers(timers);
    };

    updateCooldowns();
    const interval = setInterval(updateCooldowns, 1000);
    return () => clearInterval(interval);
  }, [providers]);

  const handleToggleProvider = async (providerName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { action: 'toggle-provider', provider: providerName }
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Toggle failed');
      }

      toast.success(`${providerName} ${data.is_enabled ? 'enabled' : 'disabled'}`);
      fetchProviders();
    } catch (err: any) {
      toast.error(`Failed to toggle provider: ${err.message}`);
    }
  };

  const handleResetAllLimits = async () => {
    setIsResetting(true);
    try {
      // Direct database update to reset all limits
      const { error } = await supabase
        .from('ai_providers')
        .update({
          daily_usage: 0,
          current_usage: 0,
          cooldown_until: null,
          last_daily_reset_at: new Date().toISOString()
        })
        .neq('provider_name', '');

      if (error) throw error;

      toast.success('All AI provider limits reset');
      fetchProviders();
    } catch (err: any) {
      toast.error(`Reset failed: ${err.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  const getProviderStyle = (name: string) => {
    return PROVIDER_STYLES[name.toLowerCase()] || { 
      bg: 'bg-muted/20', 
      text: 'text-muted-foreground', 
      border: 'border-muted/40' 
    };
  };

  const getHealthStatus = (provider: AIProvider) => {
    const dailyPct = (provider.daily_usage / (provider.rate_limit_rpd || 1000)) * 100;
    const isInCooldown = cooldownTimers[provider.provider_name] > 0;
    
    if (isInCooldown) return { status: 'cooldown', color: 'text-rose-400', icon: Clock };
    if (dailyPct >= 95) return { status: 'exhausted', color: 'text-rose-400', icon: XCircle };
    if (dailyPct >= 75) return { status: 'warning', color: 'text-amber-400', icon: AlertTriangle };
    if (!provider.is_enabled) return { status: 'disabled', color: 'text-muted-foreground', icon: XCircle };
    return { status: 'healthy', color: 'text-emerald-400', icon: CheckCircle };
  };

  // Aggregate stats
  const totalCapacity = providers.reduce((sum, p) => sum + (p.rate_limit_rpd || 0), 0);
  const totalUsed = providers.reduce((sum, p) => sum + (p.daily_usage || 0), 0);
  const enabledCount = providers.filter(p => p.is_enabled).length;

  if (isLoading) {
    return (
      <div className="card-purple p-4 flex items-center justify-center">
        <Brain className="w-5 h-5 animate-pulse text-purple-400 mr-2" />
        <span className="text-sm text-muted-foreground">Loading providers...</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="card-purple p-3 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-purple-500/20">
              <Brain className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">AI Provider Health</h3>
              <p className="text-[10px] text-muted-foreground">
                {enabledCount}/{providers.length} active • {totalUsed.toLocaleString()}/{totalCapacity.toLocaleString()} daily
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchProviders}
                    className="h-7 px-2 text-xs"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Refresh provider status</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetAllLimits}
                    disabled={isResetting}
                    className="h-7 px-2 text-xs border-amber-500/30 hover:bg-amber-500/20"
                  >
                    <RotateCcw className={cn("w-3 h-3 mr-1", isResetting && "animate-spin")} />
                    Reset All
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Reset all daily limits to 0</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Provider Grid */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
          {providers.map((provider) => {
            const style = getProviderStyle(provider.provider_name);
            const health = getHealthStatus(provider);
            const HealthIcon = health.icon;
            
            const dailyPct = Math.min(100, (provider.daily_usage / (provider.rate_limit_rpd || 1000)) * 100);
            const minutePct = Math.min(100, (provider.current_usage / (provider.rate_limit_rpm || 30)) * 100);
            const remaining = (provider.rate_limit_rpd || 1000) - (provider.daily_usage || 0);
            const avgLatency = provider.success_count > 0 
              ? Math.round(provider.total_latency_ms / provider.success_count) 
              : 0;
            const successRate = (provider.success_count + provider.error_count) > 0
              ? Math.round((provider.success_count / (provider.success_count + provider.error_count)) * 100)
              : 100;
            const cooldownSecs = cooldownTimers[provider.provider_name] || 0;

            return (
              <div
                key={provider.id}
                className={cn(
                  "p-2.5 rounded-lg border transition-all",
                  style.bg,
                  style.border,
                  !provider.is_enabled && "opacity-50"
                )}
              >
                {/* Top Row: Name + Toggle */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <HealthIcon className={cn("w-3.5 h-3.5", health.color)} />
                    <span className={cn("font-medium text-sm", style.text)}>
                      {provider.display_name}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground font-mono">
                      {provider.short_name}
                    </span>
                    {provider.free_tier_info && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                        FREE
                      </span>
                    )}
                  </div>
                  
                  <Switch
                    checked={provider.is_enabled}
                    onCheckedChange={() => handleToggleProvider(provider.provider_name)}
                    className="scale-75"
                  />
                </div>

                {/* Cooldown Warning */}
                {cooldownSecs > 0 && (
                  <div className="mb-2 px-2 py-1 rounded bg-rose-500/20 border border-rose-500/30 flex items-center gap-2">
                    <Clock className="w-3 h-3 text-rose-400" />
                    <span className="text-[10px] text-rose-300">
                      Cooldown: {cooldownSecs}s remaining
                    </span>
                  </div>
                )}

                {/* Progress Bars */}
                <div className="space-y-1.5">
                  {/* Daily Usage */}
                  <div>
                    <div className="flex items-center justify-between text-[9px] mb-0.5">
                      <span className="text-muted-foreground">Daily</span>
                      <span className={cn(
                        "font-mono",
                        dailyPct >= 95 ? "text-rose-400" :
                        dailyPct >= 75 ? "text-amber-400" : "text-muted-foreground"
                      )}>
                        {provider.daily_usage || 0}/{provider.rate_limit_rpd || 1000} ({dailyPct.toFixed(0)}%)
                      </span>
                    </div>
                    <Progress 
                      value={dailyPct} 
                      className="h-1.5"
                    />
                  </div>

                  {/* Minute Usage */}
                  <div>
                    <div className="flex items-center justify-between text-[9px] mb-0.5">
                      <span className="text-muted-foreground">Minute</span>
                      <span className="font-mono text-muted-foreground">
                        {provider.current_usage || 0}/{provider.rate_limit_rpm || 30} ({minutePct.toFixed(0)}%)
                      </span>
                    </div>
                    <Progress 
                      value={minutePct} 
                      className="h-1"
                    />
                  </div>
                </div>

                {/* Stats Row */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30 text-[9px]">
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">
                      Latency: <span className="font-mono text-foreground">{avgLatency}ms</span>
                    </span>
                    <span className="text-muted-foreground">
                      Success: <span className={cn(
                        "font-mono",
                        successRate >= 95 ? "text-emerald-400" :
                        successRate >= 80 ? "text-amber-400" : "text-rose-400"
                      )}>{successRate}%</span>
                    </span>
                  </div>
                  <span className={cn(
                    "font-mono",
                    remaining > 500 ? "text-emerald-400" :
                    remaining > 100 ? "text-amber-400" : "text-rose-400"
                  )}>
                    {remaining.toLocaleString()} left
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer: Total Capacity */}
        <div className="pt-2 border-t border-border/30 flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="text-muted-foreground">
              Total: <span className="font-mono text-foreground">{totalCapacity.toLocaleString()}</span> req/day
            </span>
          </div>
          <span className="text-muted-foreground">
            Used today: <span className={cn(
              "font-mono",
              (totalUsed / totalCapacity) < 0.5 ? "text-emerald-400" :
              (totalUsed / totalCapacity) < 0.8 ? "text-amber-400" : "text-rose-400"
            )}>{totalUsed.toLocaleString()}</span>
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
