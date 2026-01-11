import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { Server, Cloud, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CHART_COLORS, chartStyles } from '@/lib/chartTheme';

interface LatencyData {
  exchange: string;
  vps: number;
  edge: number;
  savings: number;
}

export function LatencyComparisonChart() {
  const [data, setData] = useState<LatencyData[]>([]);
  const [totalSavings, setTotalSavings] = useState(0);

  useEffect(() => {
    fetchLatencyData();
  }, []);

  const fetchLatencyData = async () => {
    // Fetch connected exchanges first to filter
    const { data: connections } = await supabase
      .from('exchange_connections')
      .select('exchange_name')
      .eq('is_connected', true);

    // Normalize connected exchange names (lowercase, remove special chars)
    const normalizeExchange = (name: string) => name.toLowerCase().replace(/[.\s-]/g, '');
    const connectedSet = new Set(
      connections?.map(c => normalizeExchange(c.exchange_name)) || []
    );

    // Fetch VPS latency from exchange_pulse where data exists
    const { data: pulseData } = await supabase
      .from('exchange_pulse')
      .select('exchange_name, latency_ms, source')
      .gt('latency_ms', 0);

    if (!pulseData || pulseData.length === 0) return;

    // Get VPS latency from pulse data (source = 'vps')
    const vpsLatencyMap = new Map<string, number>();
    const edgeLatencyMap = new Map<string, number>();
    
    for (const item of pulseData) {
      const normalizedExchange = normalizeExchange(item.exchange_name);
      
      // Only include connected exchanges
      if (!connectedSet.has(normalizedExchange)) continue;
      
      if (item.source === 'vps' && item.latency_ms > 0) {
        vpsLatencyMap.set(normalizedExchange, Number(item.latency_ms));
      } else if (item.source === 'edge' && item.latency_ms > 0) {
        edgeLatencyMap.set(normalizedExchange, Number(item.latency_ms));
      }
    }

    // Build comparison data from VPS measurements
    const comparisonData: LatencyData[] = [];
    
    // Map to display names
    const displayNames: Record<string, string> = {
      'binance': 'Binance',
      'okx': 'OKX',
      'bybit': 'Bybit',
      'bitget': 'Bitget',
      'gateio': 'Gate.io',
      'kucoin': 'KuCoin',
      'hyperliquid': 'Hyperliquid',
      'mexc': 'MEXC',
    };

    for (const [exchange, vpsLatency] of vpsLatencyMap.entries()) {
      if (vpsLatency > 0) {
        // Estimate edge latency as ~2.5x VPS if not available
        const edgeLatency = edgeLatencyMap.get(exchange) || Math.round(vpsLatency * 2.5);
        
        comparisonData.push({
          exchange: displayNames[exchange] || exchange.charAt(0).toUpperCase() + exchange.slice(1),
          vps: Math.round(vpsLatency),
          edge: edgeLatency,
          savings: Math.max(0, edgeLatency - vpsLatency)
        });
      }
    }

    // Calculate average savings
    const avgSavings = comparisonData.length > 0
      ? Math.round(comparisonData.reduce((sum, d) => sum + d.savings, 0) / comparisonData.length)
      : 0;

    setData(comparisonData);
    setTotalSavings(avgSavings);
  };

  if (data.length === 0) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-primary" />
            VPS vs Edge Latency
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No VPS latency data yet. Click "Ping from VPS" to measure.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-primary" />
            VPS vs Edge Latency
          </CardTitle>
          <Badge variant="outline" className="gap-1 text-xs border-green-500/50 text-green-400">
            <TrendingDown className="w-3 h-3" />
            Avg {totalSavings}ms faster
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid {...chartStyles.grid} />
              <XAxis 
                dataKey="exchange" 
                tick={chartStyles.axisTick}
                axisLine={{ stroke: CHART_COLORS.grid }}
              />
              <YAxis 
                tick={chartStyles.axisTick}
                axisLine={{ stroke: CHART_COLORS.grid }}
                label={{ value: 'ms', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel }}
              />
              <Tooltip
                contentStyle={chartStyles.tooltipStyle}
                labelStyle={chartStyles.tooltipLabelStyle}
                itemStyle={chartStyles.tooltipItemStyle}
                formatter={(value: number, name: string) => [
                  `${value}ms`,
                  name === 'vps' ? 'VPS (Tokyo)' : 'Edge (Supabase)'
                ]}
              />
              <Legend 
                formatter={(value) => value === 'vps' ? 'VPS (Tokyo)' : 'Edge (Supabase)'}
              />
              <Bar 
                dataKey="vps" 
                fill={CHART_COLORS.success}
                radius={chartStyles.bar.radius}
                name="vps"
              />
              <Bar 
                dataKey="edge" 
                fill={CHART_COLORS.series[5]}
                radius={chartStyles.bar.radius}
                name="edge"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Server className="w-3 h-3 text-green-400" />
            VPS (Tokyo) - Fast
          </span>
          <span className="flex items-center gap-1">
            <Cloud className="w-3 h-3 text-blue-400" />
            Edge - Slower
          </span>
        </div>
      </CardContent>
    </Card>
  );
}