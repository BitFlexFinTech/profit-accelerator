import { useState, useEffect } from 'react';
import { StatusDot } from '@/components/ui/StatusDot';
import { Brain, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface AIProvider {
  id: string;
  provider_name: string;
  is_enabled: boolean;
  daily_usage: number;
  rate_limit_rpd: number;
  cooldown_until: string | null;
}

export function AIProviderHealthCompactBar() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProviders = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_providers')
        .select('id, provider_name, is_enabled, daily_usage, rate_limit_rpd, cooldown_until')
        .order('priority', { ascending: true });

      if (!error && data) {
        setProviders(data as AIProvider[]);
      }
    } catch (err) {
      console.error('[AIProviderHealthCompactBar] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
    
    const interval = setInterval(fetchProviders, 10000);
    
    const channel = supabase
      .channel('ai-providers-compact')
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

  const enabledCount = providers.filter(p => p.is_enabled).length;
  const totalCount = providers.length;
  const totalDailyUsed = providers.reduce((sum, p) => sum + (p.daily_usage || 0), 0);
  const totalCapacity = providers.reduce((sum, p) => sum + (p.rate_limit_rpd || 0), 0);
  const usagePct = totalCapacity > 0 ? (totalDailyUsed / totalCapacity) * 100 : 0;
  const inCooldown = providers.filter(p => p.cooldown_until && new Date(p.cooldown_until) > new Date()).length;

  const healthStatus = inCooldown > 0 ? 'warning' : usagePct > 80 ? 'warning' : 'healthy';

  if (isLoading) {
    return (
      <div className="h-full px-3 flex items-center justify-between rounded border bg-purple-500/10 border-purple-500/30">
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
          <span className="text-xs">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "h-full px-3 flex items-center justify-between rounded border transition-all",
      healthStatus === 'warning' 
        ? "bg-amber-500/10 border-amber-500/30"
        : "bg-purple-500/10 border-purple-500/30"
    )}>
      <div className="flex items-center gap-2">
          <StatusDot color={healthStatus === 'warning' ? "warning" : "purple"} pulse />
        <Brain className={cn(
          "w-3.5 h-3.5",
          healthStatus === 'warning' ? "text-amber-400" : "text-purple-400"
        )} />
        <span className="text-xs font-medium">AI Providers</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className={cn(
          "font-medium",
          enabledCount > 0 ? "text-purple-400" : "text-muted-foreground"
        )}>
          {enabledCount}/{totalCount} active
        </span>
        {inCooldown > 0 && (
          <span className="text-amber-400 font-medium">
            {inCooldown} cooling
          </span>
        )}
        <span className="flex items-center gap-1 text-muted-foreground font-mono">
          <Zap className="w-3 h-3 text-amber-400" />
          {totalDailyUsed.toLocaleString()}
        </span>
      </div>
    </div>
  );
}