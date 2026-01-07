import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Lightbulb, 
  BarChart3,
  Server,
  RefreshCw,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';

interface CostData {
  provider: string;
  totalCost: number;
  computeCost: number;
  networkCost: number;
  storageCost: number;
  uptimeHours: number;
  tradesExecuted: number;
}

interface CostTrend {
  date: string;
  cost: number;
  provider?: string;
}

interface Recommendation {
  id: string;
  type: string;
  currentProvider: string;
  recommendedProvider: string;
  currentCost: number;
  recommendedCost: number;
  savingsPercent: number;
  reason: string;
  priority: string;
  isDismissed: boolean;
}

const PROVIDER_COLORS: Record<string, string> = {
  aws: 'hsl(var(--chart-1))',
  digitalocean: 'hsl(var(--chart-2))',
  vultr: 'hsl(var(--chart-3))',
  contabo: 'hsl(var(--chart-4))',
  oracle: 'hsl(var(--chart-5))',
  gcp: 'hsl(var(--primary))',
  alibaba: 'hsl(var(--accent))',
  azure: 'hsl(var(--secondary))',
};

export function CostTrackingDashboard() {
  const [costData, setCostData] = useState<CostData[]>([]);
  const [costTrends, setCostTrends] = useState<CostTrend[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalMonthlyCost, setTotalMonthlyCost] = useState(0);
  const [previousMonthCost, setPreviousMonthCost] = useState(0);

  useEffect(() => {
    fetchCostData();
  }, []);

  const fetchCostData = async () => {
    setIsLoading(true);
    
    try {
      // Fetch cost analysis data
      const { data: analysis } = await supabase
        .from('cost_analysis')
        .select('*')
        .gte('analysis_date', format(subDays(new Date(), 30), 'yyyy-MM-dd'))
        .order('analysis_date', { ascending: true });

      if (analysis) {
        // Group by provider for summary
        const providerCosts: Record<string, CostData> = {};
        let totalCost = 0;

        analysis.forEach((row) => {
          const provider = row.provider;
          if (!providerCosts[provider]) {
            providerCosts[provider] = {
              provider,
              totalCost: 0,
              computeCost: 0,
              networkCost: 0,
              storageCost: 0,
              uptimeHours: 0,
              tradesExecuted: 0,
            };
          }
          providerCosts[provider].totalCost += row.total_cost || 0;
          providerCosts[provider].computeCost += row.compute_cost || 0;
          providerCosts[provider].networkCost += row.network_cost || 0;
          providerCosts[provider].storageCost += row.storage_cost || 0;
          providerCosts[provider].uptimeHours += row.uptime_hours || 0;
          providerCosts[provider].tradesExecuted += row.trades_executed || 0;
          totalCost += row.total_cost || 0;
        });

        setCostData(Object.values(providerCosts));
        setTotalMonthlyCost(totalCost);

        // Build trend data
        const trends = analysis.map((row) => ({
          date: format(new Date(row.analysis_date), 'MMM dd'),
          cost: row.total_cost || 0,
          provider: row.provider,
        }));
        setCostTrends(trends);
      }

      // Fetch previous month for comparison
      const prevMonthStart = startOfMonth(subDays(startOfMonth(new Date()), 1));
      const prevMonthEnd = endOfMonth(prevMonthStart);
      
      const { data: prevMonth } = await supabase
        .from('cost_analysis')
        .select('total_cost')
        .gte('analysis_date', format(prevMonthStart, 'yyyy-MM-dd'))
        .lte('analysis_date', format(prevMonthEnd, 'yyyy-MM-dd'));

      if (prevMonth) {
        const prevTotal = prevMonth.reduce((sum, row) => sum + (row.total_cost || 0), 0);
        setPreviousMonthCost(prevTotal);
      }

      // Fetch recommendations
      const { data: recs } = await supabase
        .from('cost_recommendations')
        .select('*')
        .eq('is_dismissed', false)
        .order('priority', { ascending: true });

      if (recs) {
        setRecommendations(recs.map((r) => ({
          id: r.id,
          type: r.recommendation_type,
          currentProvider: r.current_provider || 'N/A',
          recommendedProvider: r.recommended_provider || 'N/A',
          currentCost: r.current_monthly_cost || 0,
          recommendedCost: r.recommended_monthly_cost || 0,
          savingsPercent: r.savings_percent || 0,
          reason: r.reason || '',
          priority: r.priority || 'medium',
          isDismissed: r.is_dismissed || false,
        })));
      }
    } catch (error) {
      console.error('Error fetching cost data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const dismissRecommendation = async (id: string) => {
    await supabase
      .from('cost_recommendations')
      .update({ is_dismissed: true })
      .eq('id', id);
    
    setRecommendations((prev) => prev.filter((r) => r.id !== id));
  };

  const costChange = previousMonthCost > 0 
    ? ((totalMonthlyCost - previousMonthCost) / previousMonthCost) * 100 
    : 0;

  const potentialSavings = recommendations.reduce(
    (sum, r) => sum + (r.currentCost - r.recommendedCost), 
    0
  );

  // Pie chart data
  const pieData = costData.map((c) => ({
    name: c.provider.toUpperCase(),
    value: c.totalCost,
    color: PROVIDER_COLORS[c.provider] || 'hsl(var(--muted))',
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Monthly Cost</p>
                <p className="text-2xl font-bold font-mono">${totalMonthlyCost.toFixed(2)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500 opacity-50" />
            </div>
            <div className="mt-2 flex items-center gap-1">
              {costChange >= 0 ? (
                <TrendingUp className="h-3 w-3 text-destructive" />
              ) : (
                <TrendingDown className="h-3 w-3 text-green-500" />
              )}
              <span className={`text-xs ${costChange >= 0 ? 'text-destructive' : 'text-green-500'}`}>
                {Math.abs(costChange).toFixed(1)}% vs last month
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Providers</p>
                <p className="text-2xl font-bold">{costData.length}</p>
              </div>
              <Server className="h-8 w-8 text-primary opacity-50" />
            </div>
            <div className="mt-2 flex gap-1 flex-wrap">
              {costData.slice(0, 4).map((c) => (
                <Badge key={c.provider} variant="secondary" className="text-xs">
                  {c.provider}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Potential Savings</p>
                <p className="text-2xl font-bold font-mono text-green-500">
                  ${potentialSavings.toFixed(2)}
                </p>
              </div>
              <Lightbulb className="h-8 w-8 text-yellow-500 opacity-50" />
            </div>
            <div className="mt-2">
              <span className="text-xs text-muted-foreground">
                {recommendations.length} recommendations
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Trades</p>
                <p className="text-2xl font-bold">
                  {costData.reduce((sum, c) => sum + c.tradesExecuted, 0).toLocaleString()}
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-accent opacity-50" />
            </div>
            <div className="mt-2">
              <span className="text-xs text-muted-foreground">
                ${(totalMonthlyCost / Math.max(1, costData.reduce((sum, c) => sum + c.tradesExecuted, 0))).toFixed(4)} per trade
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="trends" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="trends">Cost Trends</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
          <TabsTrigger value="recommendations">Optimize</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">30-Day Cost Trend</CardTitle>
              <Button variant="ghost" size="sm" onClick={fetchCostData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {isLoading ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    Loading...
                  </div>
                ) : costTrends.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={costTrends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="date" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px'
                        }}
                        formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="cost" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    No cost data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pie Chart */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-base">Cost by Provider</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px'
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      No data available
                    </div>
                  )}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-2 justify-center mt-4">
                  {pieData.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-1">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="text-xs text-muted-foreground">{entry.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Cost Type Breakdown */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-base">Cost Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  {costData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={costData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis 
                          dataKey="provider" 
                          stroke="hsl(var(--muted-foreground))" 
                          fontSize={12}
                          tickFormatter={(v) => v.toUpperCase()}
                        />
                        <YAxis 
                          stroke="hsl(var(--muted-foreground))" 
                          fontSize={12}
                          tickFormatter={(v) => `$${v}`}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px'
                          }}
                          formatter={(value: number) => [`$${value.toFixed(2)}`]}
                        />
                        <Bar dataKey="computeCost" name="Compute" fill="hsl(var(--primary))" stackId="a" />
                        <Bar dataKey="networkCost" name="Network" fill="hsl(var(--accent))" stackId="a" />
                        <Bar dataKey="storageCost" name="Storage" fill="hsl(var(--secondary))" stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      No data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Provider Details Table */}
            <Card className="bg-card/50 border-border/50 lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Provider Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Provider</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Total Cost</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Compute</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Network</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Storage</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Uptime</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Trades</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costData.map((row) => (
                        <tr key={row.provider} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="py-2 px-3 font-medium uppercase">{row.provider}</td>
                          <td className="py-2 px-3 text-right font-mono">${row.totalCost.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-mono">${row.computeCost.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-mono">${row.networkCost.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-mono">${row.storageCost.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right">{row.uptimeHours.toFixed(0)}h</td>
                          <td className="py-2 px-3 text-right">{row.tradesExecuted.toLocaleString()}</td>
                        </tr>
                      ))}
                      {costData.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-muted-foreground">
                            No cost data available
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="recommendations" className="mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                Optimization Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recommendations.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  <p>Your infrastructure is optimized!</p>
                  <p className="text-sm">No cost-saving recommendations at this time.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recommendations.map((rec) => (
                    <div 
                      key={rec.id}
                      className="p-4 rounded-lg border border-border bg-muted/20"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge 
                              variant={rec.priority === 'high' ? 'destructive' : 'secondary'}
                              className="uppercase text-xs"
                            >
                              {rec.priority}
                            </Badge>
                            <span className="text-sm font-medium">{rec.type.replace(/_/g, ' ')}</span>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{rec.reason}</p>
                          <div className="flex items-center gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Current: </span>
                              <span className="font-mono">{rec.currentProvider} (${rec.currentCost}/mo)</span>
                            </div>
                            <TrendingDown className="h-4 w-4 text-green-500" />
                            <div>
                              <span className="text-muted-foreground">Recommended: </span>
                              <span className="font-mono text-green-500">
                                {rec.recommendedProvider} (${rec.recommendedCost}/mo)
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-green-500">
                            Save {rec.savingsPercent.toFixed(0)}%
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => dismissRecommendation(rec.id)}
                            className="mt-2"
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
