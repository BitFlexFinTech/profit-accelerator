import { useState, useEffect, useCallback } from 'react';
import { Activity, CheckCircle2, XCircle, AlertTriangle, Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface ExchangePulse {
  id: string;
  exchange_name: string;
  status: 'healthy' | 'jitter' | 'error';
  latency_ms: number;
  source?: string;
  is_connected?: boolean;
}

interface RateLimitStat {
  service: string;
  usagePercent: number;
  status: 'ok' | 'warning' | 'critical';
}

interface PriceChange {
  symbol: string;
  change: number;
}

export function ExchangeInfoPanel() {
  const [pulses, setPulses] = useState<ExchangePulse[]>([]);
  const [rateLimits, setRateLimits] = useState<RateLimitStat[]>([]);
  const [sentimentIndex, setSentimentIndex] = useState<number | null>(null);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);

  // Fetch exchange pulse - prioritize connected exchanges
  const fetchPulses = useCallback(async () => {
    try {
      // Get connected exchanges first
      const { data: connections } = await supabase
        .from('exchange_connections')
        .select('exchange_name')
        .eq('is_connected', true);
      
      const connectedNames = connections?.map(c => c.exchange_name.toLowerCase()) || [];
      
      const { data } = await supabase
        .from('exchange_pulse')
        .select('id, exchange_name, status, latency_ms, source')
        .order('exchange_name')
        .limit(6);

      if (data) {
        // Sort: connected exchanges first
        const sorted = [...data].sort((a, b) => {
          const aConnected = connectedNames.includes(a.exchange_name.toLowerCase());
          const bConnected = connectedNames.includes(b.exchange_name.toLowerCase());
          if (aConnected && !bConnected) return -1;
          if (!aConnected && bConnected) return 1;
          return 0;
        }).map(p => ({
          ...p,
          is_connected: connectedNames.includes(p.exchange_name.toLowerCase())
        }));
        
        setPulses(sorted as ExchangePulse[]);
      }
    } catch (err) {
      console.error('[ExchangeInfoPanel] Pulse error:', err);
    }
  }, []);

  // Fetch rate limits
  const fetchRateLimits = useCallback(async () => {
    const services = ['binance', 'okx', 'bybit', 'kucoin', 'groq'];
    const limits: Record<string, number> = { binance: 1200, okx: 3000, kucoin: 2000, bybit: 2500, groq: 30 };
    
    try {
      const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
      const { data: logs } = await supabase
        .from('api_request_logs')
        .select('exchange_name')
        .gte('request_time', oneMinuteAgo);
      
      const counts: Record<string, number> = {};
      logs?.forEach(log => {
        const svc = log.exchange_name.toLowerCase();
        counts[svc] = (counts[svc] || 0) + 1;
      });
      
      const stats: RateLimitStat[] = services.map(svc => {
        const usage = (counts[svc] || 0) / (limits[svc] || 1000) * 100;
        return {
          service: svc,
          usagePercent: Math.min(100, usage),
          status: usage >= 90 ? 'critical' : usage >= 70 ? 'warning' : 'ok'
        };
      });
      
      setRateLimits(stats);
    } catch (err) {
      console.error('[ExchangeInfoPanel] Rate limit error:', err);
    }
  }, []);

  // Fetch sentiment
  const fetchSentiment = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke('trade-engine', {
        body: { 
          action: 'get-tickers',
          symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT']
        }
      });

      if (data?.tickers && data.tickers.length > 0) {
        const changes = data.tickers.map((t: any) => ({
          symbol: t.symbol.replace('USDT', ''),
          change: t.priceChange24h
        }));
        
        setPriceChanges(changes);
        const avgChange = changes.reduce((sum: number, p: PriceChange) => sum + p.change, 0) / changes.length;
        const sentiment = Math.min(100, Math.max(0, 50 + (avgChange * 5)));
        setSentimentIndex(Math.round(sentiment));
      }
    } catch (err) {
      console.error('[ExchangeInfoPanel] Sentiment error:', err);
    }
  }, []);

  useEffect(() => {
    fetchPulses();
    fetchRateLimits();
    fetchSentiment();
    
    const pulseInterval = setInterval(fetchPulses, 15000);
    const rateInterval = setInterval(fetchRateLimits, 5000);
    const sentimentInterval = setInterval(fetchSentiment, 60000);
    
    return () => {
      clearInterval(pulseInterval);
      clearInterval(rateInterval);
      clearInterval(sentimentInterval);
    };
  }, [fetchPulses, fetchRateLimits, fetchSentiment]);

  const getStatusIcon = (status: string) => {
    if (status === 'healthy') return <CheckCircle2 className="w-2 h-2 text-green-400" />;
    if (status === 'jitter') return <AlertTriangle className="w-2 h-2 text-yellow-400" />;
    return <XCircle className="w-2 h-2 text-red-400" />;
  };

  const getSentimentColor = (index: number | null) => {
    if (index === null) return 'text-muted-foreground';
    if (index <= 25) return 'text-destructive';
    if (index <= 45) return 'text-warning';
    if (index <= 55) return 'text-yellow-500';
    if (index <= 75) return 'text-lime-500';
    return 'text-success';
  };

  const getTrendIcon = (change: number) => {
    if (change > 0.5) return <TrendingUp className="w-2 h-2 text-success" />;
    if (change < -0.5) return <TrendingDown className="w-2 h-2 text-destructive" />;
    return <Minus className="w-2 h-2 text-muted-foreground" />;
  };

  return (
    <div className="glass-card p-2 h-full flex flex-col gap-1.5">
      {/* Row 1: Exchange Pulse - 6 mini boxes */}
      <div className="flex-shrink-0">
        <div className="flex items-center gap-1 mb-1">
          <Activity className="w-2.5 h-2.5 text-primary" />
          <span className="text-[9px] font-medium">Exchange Pulse</span>
        </div>
        <div className="grid grid-cols-6 gap-0.5">
          {pulses.slice(0, 6).map((pulse) => (
            <div
              key={pulse.id}
              className={cn(
                "p-0.5 rounded text-center",
                pulse.status === 'healthy' ? 'bg-green-500/10 border border-green-500/30' :
                pulse.status === 'jitter' ? 'bg-yellow-500/10 border border-yellow-500/30' :
                'bg-red-500/10 border border-red-500/30',
                pulse.is_connected && 'ring-1 ring-primary/50'
              )}
            >
              <div className="flex items-center justify-center">
                {getStatusIcon(pulse.status)}
              </div>
              <p className="text-[7px] font-medium truncate">
                {pulse.exchange_name.slice(0, 3).toUpperCase()}
              </p>
              <p className="text-[6px] font-mono text-muted-foreground">
                {Math.round(pulse.latency_ms)}ms
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Row 2: API Rate Limits - 5 mini progress bars */}
      <div className="flex-shrink-0">
        <div className="flex items-center gap-1 mb-1">
          <Zap className="w-2.5 h-2.5 text-primary" />
          <span className="text-[9px] font-medium">API Limits</span>
        </div>
        <div className="grid grid-cols-5 gap-0.5">
          {rateLimits.map((stat) => (
            <div key={stat.service} className="text-center">
              <span className="text-[7px] font-medium block truncate">
                {stat.service.slice(0, 3).toUpperCase()}
              </span>
              <Progress 
                value={stat.usagePercent} 
                className="h-0.5 mt-0.5"
              />
              <span className="text-[6px] text-muted-foreground">
                {Math.round(stat.usagePercent)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Sentiment - compact gauge + mini price changes */}
      <div className="flex-1 min-h-0 flex items-center gap-2">
        <div className="flex-shrink-0">
          <span className={`text-sm font-bold ${getSentimentColor(sentimentIndex)}`}>
            {sentimentIndex ?? '--'}
          </span>
          <div className="w-8 h-0.5 bg-secondary rounded-full overflow-hidden mt-0.5">
            <div 
              className="h-full rounded-full"
              style={{ 
                width: `${sentimentIndex ?? 0}%`,
                background: 'linear-gradient(90deg, rgb(239, 68, 68), rgb(234, 179, 8), rgb(34, 197, 94))'
              }}
            />
          </div>
        </div>
        <div className="flex-1 flex gap-1 overflow-x-auto">
          {priceChanges.slice(0, 4).map(({ symbol, change }) => (
            <div key={symbol} className="flex items-center gap-0.5 text-[8px]">
              <span className="font-medium">{symbol}</span>
              {getTrendIcon(change)}
              <span className={change > 0 ? 'text-success' : change < 0 ? 'text-destructive' : 'text-muted-foreground'}>
                {change > 0 ? '+' : ''}{change.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
