import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { DollarSign, Clock, TrendingUp, Server } from 'lucide-react';
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
}

const PROVIDER_PRICING: Record<string, number> = {
  digitalocean: 0.00893, // $6/mo ÷ 672 hours
  aws: 0.0116,           // t4g.micro ~$8.35/mo
  gcp: 0.0,              // e2-micro free tier
  vultr: 0.00744,        // $5/mo
  linode: 0.00744,       // $5/mo
  oracle: 0.0,           // Always Free
};

export function VPSCostPanel() {
  const [costData, setCostData] = useState<VPSCostData | null>(null);

  useEffect(() => {
    const fetchCostData = async () => {
      // Get VPS config
      const { data: vpsConfig } = await supabase
        .from('vps_config')
        .select('provider, created_at, status')
        .eq('status', 'running')
        .single();

      if (!vpsConfig) {
        setCostData(null);
        return;
      }

      // Get trade count for today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { count: tradesCount } = await supabase
        .from('trading_journal')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      const provider = vpsConfig.provider || 'digitalocean';
      const startTime = vpsConfig.created_at ? new Date(vpsConfig.created_at) : null;
      const hourlyRate = PROVIDER_PRICING[provider] || 0.00893;
      
      // Calculate uptime
      const uptimeMs = startTime ? Date.now() - startTime.getTime() : 0;
      const uptimeHours = uptimeMs / (1000 * 60 * 60);
      
      // Calculate costs
      const currentCost = uptimeHours * hourlyRate;
      const projectedMonthlyCost = hourlyRate * 24 * 30; // 720 hours/month
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

  return (
    <Card className="p-4 bg-card/50 border-border/50 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-green-500" />
          VPS Cost Tracker
        </h3>
        <span className="text-xs text-muted-foreground capitalize">{costData.provider}</span>
      </div>

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
          <div className="text-lg font-mono font-semibold text-green-500">
            ${costData.currentCost.toFixed(4)}
          </div>
        </div>

        {/* Monthly Projection */}
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <TrendingUp className="h-3 w-3" />
            Monthly Est.
          </div>
          <div className="text-lg font-mono font-semibold">
            ${costData.projectedMonthlyCost.toFixed(2)}
          </div>
        </div>

        {/* Cost Per Trade */}
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Server className="h-3 w-3" />
            $/Trade
          </div>
          <div className="text-lg font-mono font-semibold">
            {costData.tradesExecuted > 0 
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
        Rate: ${(costData.hourlyRate * 1000).toFixed(2)}/1000 hrs
      </div>
    </Card>
  );
}
