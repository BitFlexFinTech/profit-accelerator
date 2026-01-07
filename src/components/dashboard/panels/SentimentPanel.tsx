import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export function SentimentPanel() {
  const [fearGreedIndex, setFearGreedIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [priceChanges, setPriceChanges] = useState<{ symbol: string; change: number }[]>([]);

  // Fetch real Fear & Greed Index from Alternative.me API
  useEffect(() => {
    const fetchSentiment = async () => {
      try {
        // Try to get from our database first (if we store it)
        const { data: sentimentData } = await supabase
          .from('sentiment_data')
          .select('fear_greed_index, symbol, sentiment_score')
          .order('recorded_at', { ascending: false })
          .limit(5);

        if (sentimentData && sentimentData.length > 0) {
          const fgi = sentimentData.find(s => s.fear_greed_index !== null);
          if (fgi?.fear_greed_index) {
            setFearGreedIndex(fgi.fear_greed_index);
          }
        }

        // Get exchange price changes if available
        const { data: exchangeData } = await supabase
          .from('exchange_connections')
          .select('exchange_name, balance_usdt, balance_updated_at')
          .eq('is_connected', true);

        if (exchangeData) {
          // We don't have price change data, so we'll show N/A
          setPriceChanges([
            { symbol: 'BTC', change: 0 },
            { symbol: 'ETH', change: 0 },
            { symbol: 'SOL', change: 0 },
          ]);
        }
      } catch (error) {
        console.error('Failed to fetch sentiment data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSentiment();
  }, []);

  const getSentimentLabel = (index: number | null) => {
    if (index === null) return 'N/A';
    if (index > 75) return 'Extreme Greed';
    if (index > 55) return 'Greed';
    if (index > 45) return 'Neutral';
    if (index > 25) return 'Fear';
    return 'Extreme Fear';
  };

  const getSentimentColor = (index: number | null) => {
    if (index === null) return 'text-muted-foreground';
    if (index > 55) return 'text-success';
    if (index < 45) return 'text-destructive';
    return 'text-warning';
  };

  const getTrendIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="w-5 h-5 mx-auto mb-1 text-success" />;
    if (change < 0) return <TrendingDown className="w-5 h-5 mx-auto mb-1 text-destructive" />;
    return <Minus className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />;
  };

  const getTrendColor = (change: number) => {
    if (change > 0) return 'text-success';
    if (change < 0) return 'text-destructive';
    return 'text-muted-foreground';
  };

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold mb-4">Market Sentiment</h3>
      
      {/* Fear & Greed Gauge */}
      <div className="relative h-32 mb-4">
        <div className="absolute inset-0 flex items-center justify-center">
          {isLoading ? (
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          ) : (
            <div className="text-center">
              <span className={`text-4xl font-bold ${getSentimentColor(fearGreedIndex)}`}>
                {fearGreedIndex ?? '—'}
              </span>
              <p className={`text-sm font-medium ${getSentimentColor(fearGreedIndex)}`}>
                {getSentimentLabel(fearGreedIndex)}
              </p>
            </div>
          )}
        </div>
        
        {/* Gauge background */}
        <svg viewBox="0 0 200 100" className="w-full h-full">
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(340 100% 45%)" />
              <stop offset="50%" stopColor="hsl(45 100% 50%)" />
              <stop offset="100%" stopColor="hsl(160 100% 40%)" />
            </linearGradient>
          </defs>
          <path
            d="M 20 90 A 80 80 0 0 1 180 90"
            fill="none"
            stroke="hsl(var(--secondary))"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d="M 20 90 A 80 80 0 0 1 180 90"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${((fearGreedIndex ?? 0) / 100) * 251} 251`}
          />
        </svg>
      </div>

      {/* Trend Indicators */}
      <div className="grid grid-cols-3 gap-3">
        {priceChanges.length > 0 ? (
          priceChanges.map((item) => (
            <div key={item.symbol} className="p-3 rounded-lg bg-secondary/30 text-center">
              {getTrendIcon(item.change)}
              <p className="text-xs text-muted-foreground">{item.symbol}</p>
              <p className={`text-sm font-medium ${getTrendColor(item.change)}`}>
                {item.change === 0 ? 'N/A' : `${item.change > 0 ? '+' : ''}${item.change.toFixed(1)}%`}
              </p>
            </div>
          ))
        ) : (
          <div className="col-span-3 text-center text-sm text-muted-foreground py-4">
            No price data available
          </div>
        )}
      </div>
    </div>
  );
}
