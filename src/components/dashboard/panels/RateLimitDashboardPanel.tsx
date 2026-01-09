import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Gauge, Clock, AlertTriangle, CheckCircle } from 'lucide-react';

interface ProviderLimit {
  provider_name: string;
  display_name: string;
  rate_limit_rpm: number;
  rate_limit_rpd: number;
  current_usage: number;
  daily_usage: number;
  last_reset_at: string | null;
  cooldown_until: string | null;
  color_hex: string;
}

export function RateLimitDashboardPanel() {
  const [providers, setProviders] = useState<ProviderLimit[]>([]);
  const [secondsToReset, setSecondsToReset] = useState(60);
  const [loading, setLoading] = useState(true);

  const fetchProviders = async () => {
    const { data, error } = await supabase
      .from('ai_providers')
      .select('provider_name, display_name, rate_limit_rpm, rate_limit_rpd, current_usage, daily_usage, last_reset_at, cooldown_until, color_hex')
      .eq('is_enabled', true)
      .order('priority', { ascending: true });

    if (!error && data) {
      setProviders(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProviders();

    // Refresh every 10 seconds
    const interval = setInterval(fetchProviders, 10000);

    return () => clearInterval(interval);
  }, []);

  // Countdown timer for minute reset
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsToReset(prev => {
        if (prev <= 1) {
          fetchProviders();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const getUsageStatus = (current: number, limit: number) => {
    const percent = (current / limit) * 100;
    if (percent >= 90) return { color: 'text-destructive', bg: 'bg-destructive', status: 'critical' };
    if (percent >= 70) return { color: 'text-warning', bg: 'bg-warning', status: 'warning' };
    return { color: 'text-success', bg: 'bg-success', status: 'ok' };
  };

  const isInCooldown = (cooldownUntil: string | null) => {
    if (!cooldownUntil) return false;
    return new Date(cooldownUntil) > new Date();
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="flex items-center justify-center py-8">
          <span className="text-muted-foreground">Loading rate limits...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gauge className="w-4 h-4 text-primary" />
            API Rate Limits
          </CardTitle>
          <Badge variant="outline" className="text-xs font-mono">
            <Clock className="w-3 h-3 mr-1" />
            Reset: {secondsToReset}s
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {providers.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No AI providers enabled
          </p>
        ) : (
          providers.map((provider) => {
            const rpmStatus = getUsageStatus(provider.current_usage, provider.rate_limit_rpm);
            const rpdStatus = getUsageStatus(provider.daily_usage, provider.rate_limit_rpd);
            const inCooldown = isInCooldown(provider.cooldown_until);

            return (
              <div 
                key={provider.provider_name} 
                className="p-2 rounded-lg border bg-secondary/20"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: provider.color_hex }}
                    />
                    <span className="text-xs font-medium">{provider.display_name}</span>
                    {inCooldown && (
                      <Badge variant="destructive" className="text-[10px] px-1">
                        Cooldown
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {rpmStatus.status === 'ok' && rpdStatus.status === 'ok' ? (
                      <CheckCircle className="w-3 h-3 text-success" />
                    ) : (
                      <AlertTriangle className={`w-3 h-3 ${rpmStatus.status === 'critical' || rpdStatus.status === 'critical' ? 'text-destructive' : 'text-warning'}`} />
                    )}
                  </div>
                </div>

                {/* Per-Minute Usage */}
                <div className="mb-2">
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-muted-foreground">Per Minute</span>
                    <span className={rpmStatus.color}>
                      {provider.current_usage}/{provider.rate_limit_rpm}
                    </span>
                  </div>
                  <Progress 
                    value={(provider.current_usage / provider.rate_limit_rpm) * 100} 
                    className="h-1.5"
                  />
                </div>

                {/* Daily Usage */}
                <div>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-muted-foreground">Daily</span>
                    <span className={rpdStatus.color}>
                      {provider.daily_usage}/{provider.rate_limit_rpd}
                    </span>
                  </div>
                  <Progress 
                    value={(provider.daily_usage / provider.rate_limit_rpd) * 100} 
                    className="h-1.5"
                  />
                </div>
              </div>
            );
          })
        )}

        {/* Exchange Rate Limits (Static for now) */}
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground mb-2">Exchange Limits</p>
          <div className="grid grid-cols-3 gap-2">
            {['Binance', 'OKX', 'Bybit'].map((exchange) => (
              <div key={exchange} className="text-center p-1.5 rounded bg-secondary/30">
                <p className="text-[10px] font-medium">{exchange}</p>
                <p className="text-[10px] text-success">OK</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
