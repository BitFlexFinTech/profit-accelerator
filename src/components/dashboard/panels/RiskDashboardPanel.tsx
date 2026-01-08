import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, TrendingDown, DollarSign, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { RiskManager } from '@/lib/riskManager';

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

  const getStatusColor = (percent: number) => {
    if (percent >= 100) return 'destructive';
    if (percent >= 70) return 'warning';
    return 'success';
  };

  const getProgressColor = (percent: number) => {
    if (percent >= 100) return 'bg-destructive';
    if (percent >= 70) return 'bg-warning';
    return 'bg-success';
  };

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
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
      current: 0, // Would need to track current largest position
      limit: metrics.limits.maxPositionSize,
      percent: 0,
      format: (v: number) => `$${v.toFixed(0)}`
    }
  ];

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          Risk Monitor
          {metrics.dailyLossPercent >= 70 || metrics.drawdownPercent >= 70 ? (
            <Badge variant="destructive" className="ml-auto animate-pulse">
              <AlertTriangle className="w-3 h-3 mr-1" />
              At Risk
            </Badge>
          ) : (
            <Badge variant="outline" className="ml-auto text-success border-success/40">
              Normal
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Balance */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
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
                <item.icon className={`w-3.5 h-3.5 ${
                  item.percent >= 100 ? 'text-destructive' :
                  item.percent >= 70 ? 'text-warning' :
                  'text-muted-foreground'
                }`} />
                <span className="text-muted-foreground">{item.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{item.format(item.current)}</span>
                <span className="text-xs text-muted-foreground">
                  / {item.format(item.limit)}
                </span>
              </div>
            </div>
            <div className="relative">
              <Progress 
                value={Math.min(item.percent, 100)} 
                className="h-2"
              />
              <div 
                className={`absolute inset-0 h-2 rounded-full ${getProgressColor(item.percent)}`}
                style={{ width: `${Math.min(item.percent, 100)}%` }}
              />
            </div>
            {item.percent >= 70 && (
              <div className={`text-xs ${
                item.percent >= 100 ? 'text-destructive' : 'text-warning'
              }`}>
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
          <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-xs text-destructive">
              Balance below minimum ${metrics.limits.minBalance}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
