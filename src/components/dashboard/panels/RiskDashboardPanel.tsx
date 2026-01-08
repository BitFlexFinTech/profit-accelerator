import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, TrendingDown, DollarSign, Loader2, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RiskManager } from '@/lib/riskManager';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IconContainer } from '@/components/ui/IconContainer';
import { cn } from '@/lib/utils';

interface RiskMetrics {
  dailyLoss: number;
  drawdown: number;
  currentBalance: number | null;
  limits: {
    maxPositionSize: number;
    maxDailyLoss: number;
    maxDrawdown: number;
    minBalance: number;
  };
  dailyLossPercent: number;
  drawdownPercent: number;
  maxOpenPosition: number;
  maxPositionPercent: number;
}

export function RiskDashboardPanel() {
  const [metrics, setMetrics] = useState<RiskMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      const riskManager = RiskManager.getInstance();
      const data = await riskManager.getRiskMetrics();
      setMetrics(data);
    } catch (error) {
      console.error('Failed to fetch risk metrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, []);

  const getProgressColor = (percent: number) => {
    if (percent >= 100) return 'bg-red-500';
    if (percent >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (isLoading) {
    return (
      <Card className="card-red glass-card">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-red-400" />
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return null;
  }

  const riskItems = [
    {
      label: 'Daily Loss',
      icon: TrendingDown,
      current: metrics.dailyLoss,
      limit: metrics.limits.maxDailyLoss,
      percent: metrics.dailyLossPercent,
      format: (v: number) => `$${v.toFixed(2)}`
    },
    {
      label: 'Drawdown',
      icon: AlertTriangle,
      current: metrics.drawdown,
      limit: metrics.limits.maxDrawdown,
      percent: metrics.drawdownPercent,
      format: (v: number) => `${v.toFixed(1)}%`
    },
    {
      label: 'Max Position',
      icon: DollarSign,
      current: metrics.maxOpenPosition,
      limit: metrics.limits.maxPositionSize,
      percent: metrics.maxPositionPercent,
      format: (v: number) => `$${v.toFixed(0)}`
    }
  ];

  return (
    <Card className={cn(
      "card-red glass-card overflow-hidden",
      "hover:shadow-lg hover:shadow-red-500/10 transition-all duration-300"
    )}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <IconContainer color="red" size="sm">
            <Shield className="w-3.5 h-3.5" />
          </IconContainer>
          Risk Monitor
          {metrics.dailyLossPercent >= 70 || metrics.drawdownPercent >= 70 ? (
            <Badge className="ml-auto bg-red-500/20 text-red-400 border-red-500/30 animate-pulse">
              <AlertTriangle className="w-3 h-3 mr-1" />
              At Risk
            </Badge>
          ) : (
            <Badge variant="outline" className="ml-auto text-green-400 border-green-500/40 bg-green-500/10">
              Normal
            </Badge>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <Settings className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Configure risk management settings</TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Balance */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-red-500/5 border border-red-500/10">
          <span className="text-sm text-muted-foreground">Available Balance</span>
          <span className="font-semibold">
            ${(metrics.currentBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* Risk Metrics */}
        {riskItems.map((item) => (
          <div key={item.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <item.icon className={cn(
                  "w-3.5 h-3.5",
                  item.percent >= 100 ? 'text-red-400' :
                  item.percent >= 70 ? 'text-yellow-400' :
                  'text-muted-foreground'
                )} />
                <span className="text-muted-foreground">{item.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{item.format(item.current)}</span>
                <span className="text-xs text-muted-foreground">
                  / {item.format(item.limit)}
                </span>
              </div>
            </div>
            <div className="h-2 bg-red-500/10 rounded-full overflow-hidden">
              <div 
                className={cn("h-full rounded-full transition-all duration-500", getProgressColor(item.percent))}
                style={{ width: `${Math.min(item.percent, 100)}%` }}
              />
            </div>
            {item.percent >= 70 && (
              <div className={cn(
                "text-xs",
                item.percent >= 100 ? 'text-red-400' : 'text-yellow-400'
              )}>
                {item.percent >= 100 
                  ? '⚠️ Limit exceeded - trading blocked'
                  : `⚠️ ${item.percent.toFixed(0)}% of limit used`
                }
              </div>
            )}
          </div>
        ))}

        {/* Min Balance Warning */}
        {metrics.currentBalance !== null && metrics.currentBalance < metrics.limits.minBalance && (
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-red-400">
              Balance below minimum ${metrics.limits.minBalance}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
