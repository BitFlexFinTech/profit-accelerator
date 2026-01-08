import { useState, useEffect } from 'react';
import { Brain, Zap, CheckCircle, XCircle, AlertTriangle, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AIProvider {
  id: string;
  provider_name: string;
  display_name: string;
  short_name: string;
  model_name: string;
  color_hex: string;
  is_enabled: boolean;
  is_active: boolean;
  priority: number;
  rate_limit_rpm: number;
  current_usage: number;
  success_count: number;
  error_count: number;
  total_latency_ms: number;
  last_used_at: string | null;
  last_error: string | null;
  has_valid_key?: boolean;
  at_rate_limit?: boolean;
}

export function AIProviderRankingPanel() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchProviders = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { action: 'get-providers' }
      });

      if (error) throw error;
      if (data?.providers) {
        setProviders(data.providers);
      }
    } catch (err) {
      console.error('Failed to fetch AI providers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('ai-providers-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ai_providers'
      }, () => {
        fetchProviders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchProviders();
    setIsRefreshing(false);
    toast.success('AI provider status refreshed');
  };

  const handleToggleProvider = async (providerName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { action: 'toggle-provider', provider: providerName }
      });

      if (error) throw error;
      
      toast.success(`${providerName} ${data.is_enabled ? 'enabled' : 'disabled'}`);
      fetchProviders();
    } catch (err) {
      toast.error('Failed to toggle provider');
    }
  };

  const handleTestProvider = async (providerName: string) => {
    try {
      toast.info(`Testing ${providerName}...`);
      
      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { action: 'test-provider', provider: providerName }
      });

      if (error) throw error;
      
      if (data.success) {
        toast.success(`${providerName} API key is valid`);
      } else {
        toast.error(`${providerName}: ${data.error}`);
      }
      
      fetchProviders();
    } catch (err) {
      toast.error('Failed to test provider');
    }
  };

  const getStatusIcon = (provider: AIProvider) => {
    if (!provider.has_valid_key) {
      return <XCircle className="w-4 h-4 text-muted-foreground" />;
    }
    if (provider.at_rate_limit) {
      return <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse" />;
    }
    if (provider.is_enabled && provider.is_active) {
      return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    }
    return <XCircle className="w-4 h-4 text-rose-400" />;
  };

  const getSuccessRate = (provider: AIProvider) => {
    const total = (provider.success_count || 0) + (provider.error_count || 0);
    if (total === 0) return 0;
    return Math.round(((provider.success_count || 0) / total) * 100);
  };

  const getAvgLatency = (provider: AIProvider) => {
    if (!provider.success_count || !provider.total_latency_ms) return 0;
    return Math.round(provider.total_latency_ms / provider.success_count);
  };

  const getUsagePercent = (provider: AIProvider) => {
    const limit = provider.rate_limit_rpm || 30;
    const usage = provider.current_usage || 0;
    return Math.min(100, (usage / limit) * 100);
  };

  // Sort by success count descending for ranking
  const rankedProviders = [...providers].sort((a, b) => 
    (b.success_count || 0) - (a.success_count || 0)
  );

  if (isLoading) {
    return (
      <div className="card-purple p-6 transition-all duration-300">
        <div className="flex items-center gap-3 mb-4">
          <div className="icon-container-purple animate-pulse">
            <Brain className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-semibold text-purple-300">AI Provider Ranking</h3>
        </div>
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 bg-purple-500/10 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="card-purple p-6 transition-all duration-300 hover:scale-[1.005]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="icon-container-purple animate-float">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-purple-300">AI Provider Ranking</h3>
              <p className="text-xs text-muted-foreground">Multi-provider rotation system</p>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="border-purple-400/30 hover:border-purple-400 hover:bg-purple-500/20 transition-all duration-300"
              >
                <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Refresh provider status</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Provider List */}
        <div className="space-y-2">
          {rankedProviders.map((provider, index) => {
            const successRate = getSuccessRate(provider);
            const avgLatency = getAvgLatency(provider);
            const usagePercent = getUsagePercent(provider);
            const isBestPerformer = index === 0 && provider.success_count > 0;

            return (
              <div
                key={provider.id}
                className={cn(
                  "p-3 rounded-lg border transition-all duration-300 animate-fade-slide-in",
                  provider.is_enabled 
                    ? "bg-gradient-to-r from-purple-500/10 to-transparent border-purple-400/20 hover:border-purple-400/40"
                    : "bg-muted/20 border-muted/20 opacity-60"
                )}
                style={{ 
                  animationDelay: `${index * 50}ms`,
                  borderLeftColor: provider.color_hex,
                  borderLeftWidth: '3px'
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Rank */}
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                      isBestPerformer 
                        ? "bg-amber-500/30 text-amber-300 ring-1 ring-amber-400/50" 
                        : "bg-muted/30 text-muted-foreground"
                    )}>
                      {index + 1}
                    </div>

                    {/* Status Icon */}
                    <Tooltip>
                      <TooltipTrigger>
                        {getStatusIcon(provider)}
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {!provider.has_valid_key && "No valid API key configured"}
                          {provider.has_valid_key && provider.at_rate_limit && "Rate limited"}
                          {provider.has_valid_key && !provider.at_rate_limit && provider.is_enabled && "Active"}
                          {provider.has_valid_key && !provider.at_rate_limit && !provider.is_enabled && "Disabled"}
                        </p>
                      </TooltipContent>
                    </Tooltip>

                    {/* Provider Name */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span 
                          className="font-medium text-sm"
                          style={{ color: provider.color_hex }}
                        >
                          {provider.display_name}
                        </span>
                        {isBestPerformer && (
                          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/30 text-amber-300 font-bold">
                            ⭐ BEST
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{provider.model_name}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Success Rate */}
                    <Tooltip>
                      <TooltipTrigger>
                        <div className="text-center">
                          <div className={cn(
                            "text-sm font-bold",
                            successRate >= 90 ? "text-emerald-400" :
                            successRate >= 70 ? "text-amber-400" : "text-rose-400"
                          )}>
                            {successRate}%
                          </div>
                          <div className="text-[9px] text-muted-foreground">Success</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{provider.success_count || 0} successful / {provider.error_count || 0} failed</p>
                      </TooltipContent>
                    </Tooltip>

                    {/* Avg Latency */}
                    <Tooltip>
                      <TooltipTrigger>
                        <div className="text-center">
                          <div className={cn(
                            "text-sm font-bold",
                            avgLatency < 500 ? "text-emerald-400" :
                            avgLatency < 1500 ? "text-amber-400" : "text-rose-400"
                          )}>
                            {avgLatency}ms
                          </div>
                          <div className="text-[9px] text-muted-foreground">Latency</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Average response time</p>
                      </TooltipContent>
                    </Tooltip>

                    {/* Usage Gauge */}
                    <Tooltip>
                      <TooltipTrigger>
                        <div className="w-16">
                          <div className="text-[9px] text-muted-foreground text-center mb-1">
                            {provider.current_usage || 0}/{provider.rate_limit_rpm || 30}
                          </div>
                          <Progress 
                            value={usagePercent} 
                            className={cn(
                              "h-1.5",
                              usagePercent >= 80 ? "bg-rose-900/30" : "bg-purple-900/30"
                            )}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>API calls used this minute</p>
                      </TooltipContent>
                    </Tooltip>

                    {/* Toggle Button */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleProvider(provider.provider_name)}
                          className="h-7 w-7 p-0 hover:bg-purple-500/20"
                        >
                          {provider.is_enabled ? (
                            <ToggleRight className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{provider.is_enabled ? 'Disable' : 'Enable'} this provider</p>
                      </TooltipContent>
                    </Tooltip>

                    {/* Test Button */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTestProvider(provider.provider_name)}
                          className="h-7 w-7 p-0 hover:bg-purple-500/20"
                        >
                          <Zap className="w-4 h-4 text-amber-400" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Test API key</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* Error Message */}
                {provider.last_error && (
                  <div className="mt-2 text-[10px] text-rose-400 bg-rose-500/10 px-2 py-1 rounded">
                    Last error: {provider.last_error}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-purple-400/20 text-[10px] text-muted-foreground text-center">
          Providers rotate automatically when rate limited • Higher priority = tried first
        </div>
      </div>
    </TooltipProvider>
  );
}
