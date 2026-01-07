import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { DollarSign, Clock, TrendingUp, Server, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface VPSCostData {
  provider: string;
  startTime: Date | null;
  hourlyRate: number;
  uptimeHours: number;
  currentCost: number;
  projectedMonthlyCost: number;
  tradesExecuted: number;
  costPerTrade: number;
  isFree: boolean;
}

interface ProviderPricing {
  hourly: number;
  monthly: number;
  name: string;
  free: boolean;
}

const PROVIDER_PRICING: Record<string, ProviderPricing> = {
  contabo:      { hourly: 0.0104, monthly: 6.99,  name: 'Contabo',      free: false },
  vultr:        { hourly: 0.0074, monthly: 5.00,  name: 'Vultr',        free: false },
  aws:          { hourly: 0.0116, monthly: 8.35,  name: 'AWS',          free: true  },
  digitalocean: { hourly: 0.0059, monthly: 4.00,  name: 'DigitalOcean', free: false },
  gcp:          { hourly: 0,      monthly: 0,     name: 'GCP',          free: true  },
  oracle:       { hourly: 0,      monthly: 0,     name: 'Oracle',       free: true  },
  alibaba:      { hourly: 0.0044, monthly: 3.00,  name: 'Alibaba',      free: false },
  azure:        { hourly: 0,      monthly: 0,     name: 'Azure',        free: true  },
  linode:       { hourly: 0.0074, monthly: 5.00,  name: 'Linode',       free: false },
};

export function VPSCostPanel() {
  const [costData, setCostData] = useState<VPSCostData | null>(null);
  const [allProvidersCost, setAllProvidersCost] = useState<{ total: number; count: number }>({ total: 0, count: 0 });

  useEffect(() => {
    const fetchCostData = async () => {
      // Get all running VPS configs
      const { data: vpsConfigs } = await supabase
        .from('vps_config')
        .select('provider, created_at, status')
        .eq('status', 'running');

      if (!vpsConfigs || vpsConfigs.length === 0) {
        setCostData(null);
        setAllProvidersCost({ total: 0, count: 0 });
        return;
      }

      // Calculate total cost across all running providers
      let totalMonthlyCost = 0;
      let runningCount = 0;

      for (const config of vpsConfigs) {
        const provider = config.provider || 'digitalocean';
        const pricing = PROVIDER_PRICING[provider];
        if (pricing && !pricing.free) {
          totalMonthlyCost += pricing.monthly;
        }
        runningCount++;
      }

      setAllProvidersCost({ total: totalMonthlyCost, count: runningCount });

      // Use the first running VPS for detailed display
      const primaryConfig = vpsConfigs[0];

      // Get trade count for today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { count: tradesCount } = await supabase
        .from('trading_journal')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      const provider = primaryConfig.provider || 'digitalocean';
      const startTime = primaryConfig.created_at ? new Date(primaryConfig.created_at) : null;
      const pricing = PROVIDER_PRICING[provider] || { hourly: 0.0089, monthly: 6, name: provider, free: false };
      const hourlyRate = pricing.free ? 0 : pricing.hourly;
      
      // Calculate uptime
      const uptimeMs = startTime ? Date.now() - startTime.getTime() : 0;
      const uptimeHours = uptimeMs / (1000 * 60 * 60);
      
      // Calculate costs
      const currentCost = uptimeHours * hourlyRate;
      const projectedMonthlyCost = pricing.free ? 0 : pricing.monthly;
      const tradesExecuted = tradesCount || 0;
      const costPerTrade = tradesExecuted > 0 ? currentCost / tradesExecuted : 0;

      setCostData({
        provider,
        startTime,
        hourlyRate,
        uptimeHours,
        currentCost,
        projectedMonthlyCost,
        tradesExecuted,
        costPerTrade,
        isFree: pricing.free,
      });
    };

    fetchCostData();
    const interval = setInterval(fetchCostData, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  if (!costData) {
    return (
      <Card className="p-4 bg-card/50 border-border/50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Server className="h-4 w-4" />
          <span className="text-sm">No VPS running</span>
        </div>
      </Card>
    );
  }

  const formatDuration = (hours: number) => {
    if (hours < 1) return `${Math.floor(hours * 60)}m`;
    if (hours < 24) return `${Math.floor(hours)}h ${Math.floor((hours % 1) * 60)}m`;
    const days = Math.floor(hours / 24);
    const remainingHours = Math.floor(hours % 24);
    return `${days}d ${remainingHours}h`;
  };

  const pricing = PROVIDER_PRICING[costData.provider];

  return (
    <Card className="p-4 bg-card/50 border-border/50 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-green-500" />
          VPS Cost Tracker
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground capitalize">{pricing?.name || costData.provider}</span>
          {costData.isFree && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-accent/20 text-accent font-medium">FREE</span>
          )}
        </div>
      </div>

      {/* Multiple VPS indicator */}
      {allProvidersCost.count > 1 && (
        <div className="p-2 rounded bg-primary/10 border border-primary/20">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {allProvidersCost.count} VPS running
            </span>
            <span className="font-mono font-semibold text-primary">
              ${allProvidersCost.total.toFixed(2)}/mo total
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Uptime */}
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Clock className="h-3 w-3" />
            Uptime
          </div>
          <div className="text-lg font-mono font-semibold">
            {formatDuration(costData.uptimeHours)}
          </div>
        </div>

        {/* Current Cost */}
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <DollarSign className="h-3 w-3" />
            Spent
          </div>
          <div className={`text-lg font-mono font-semibold ${costData.isFree ? 'text-accent' : 'text-green-500'}`}>
            {costData.isFree ? 'FREE' : `$${costData.currentCost.toFixed(4)}`}
          </div>
        </div>

        {/* Monthly Projection */}
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <TrendingUp className="h-3 w-3" />
            Monthly Est.
          </div>
          <div className={`text-lg font-mono font-semibold ${costData.isFree ? 'text-accent' : ''}`}>
            {costData.isFree ? 'FREE' : `$${costData.projectedMonthlyCost.toFixed(2)}`}
          </div>
        </div>

        {/* Cost Per Trade */}
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Server className="h-3 w-3" />
            $/Trade
          </div>
          <div className="text-lg font-mono font-semibold">
            {costData.isFree 
              ? 'FREE'
              : costData.tradesExecuted > 0 
                ? `$${costData.costPerTrade.toFixed(4)}`
                : '—'
            }
          </div>
          <div className="text-xs text-muted-foreground">
            {costData.tradesExecuted} trades today
          </div>
        </div>
      </div>

      {/* Hourly Rate */}
      <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border/50">
        {costData.isFree ? (
          <span className="text-accent">✓ Free tier - no compute charges</span>
        ) : (
          <span>Rate: ${(costData.hourlyRate * 1000).toFixed(2)}/1000 hrs</span>
        )}
      </div>
    </Card>
  );
}
