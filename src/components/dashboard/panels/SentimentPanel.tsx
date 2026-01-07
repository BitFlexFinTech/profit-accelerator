import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';

interface PriceChange {
  symbol: string;
  change: number;
}

export function SentimentPanel() {
  const [fearGreedIndex, setFearGreedIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);

  useEffect(() => {
    const fetchSentiment = async () => {
      try {
        // Fetch real Fear & Greed Index from Alternative.me API
        const fgiResponse = await fetch('https://api.alternative.me/fng/?limit=1');
        if (fgiResponse.ok) {
          const fgiData = await fgiResponse.json();
          if (fgiData?.data?.[0]?.value) {
            setFearGreedIndex(parseInt(fgiData.data[0].value));
          }
        }

        // Fetch real 24h price changes from CoinGecko (free, no API key required)
        const priceResponse = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true'
        );
        if (priceResponse.ok) {
          const priceData = await priceResponse.json();
          setPriceChanges([
            { symbol: 'BTC', change: priceData.bitcoin?.usd_24h_change || 0 },
            { symbol: 'ETH', change: priceData.ethereum?.usd_24h_change || 0 },
            { symbol: 'SOL', change: priceData.solana?.usd_24h_change || 0 },
          ]);
        }
      } catch (error) {
        console.error('Sentiment API error:', error);
        setFearGreedIndex(null);
        setPriceChanges([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSentiment();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchSentiment, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const getSentimentLabel = (index: number | null) => {
    if (index === null) return 'N/A';
    if (index <= 25) return 'Extreme Fear';
    if (index <= 45) return 'Fear';
    if (index <= 55) return 'Neutral';
    if (index <= 75) return 'Greed';
    return 'Extreme Greed';
  };

  const getSentimentColor = (index: number | null) => {
    if (index === null) return 'text-muted-foreground';
    if (index <= 25) return 'text-red-500';
    if (index <= 45) return 'text-orange-500';
    if (index <= 55) return 'text-yellow-500';
    if (index <= 75) return 'text-lime-500';
    return 'text-emerald-500';
  };

  const getTrendIcon = (change: number) => {
    if (change > 0.5) return <TrendingUp className="w-3 h-3 text-emerald-500" />;
    if (change < -0.5) return <TrendingDown className="w-3 h-3 text-red-500" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };

  const getTrendColor = (change: number) => {
    if (change > 0.5) return 'text-emerald-500';
    if (change < -0.5) return 'text-red-500';
    return 'text-muted-foreground';
  };

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-violet-400" />
        <span className="font-medium text-sm">Market Sentiment</span>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-secondary/50 rounded w-16" />
          <div className="h-4 bg-secondary/50 rounded w-24" />
        </div>
      ) : (
        <>
          {/* Fear & Greed Index */}
          <div className="mb-3">
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${getSentimentColor(fearGreedIndex)}`}>
                {fearGreedIndex ?? '--'}
              </span>
              <span className={`text-xs ${getSentimentColor(fearGreedIndex)}`}>
                {getSentimentLabel(fearGreedIndex)}
              </span>
            </div>
            
            {/* Gauge bar */}
            <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full transition-all duration-500 rounded-full"
                style={{ 
                  width: `${fearGreedIndex ?? 0}%`,
                  background: fearGreedIndex !== null 
                    ? `linear-gradient(90deg, 
                        rgb(239, 68, 68) 0%, 
                        rgb(249, 115, 22) 25%, 
                        rgb(234, 179, 8) 50%, 
                        rgb(132, 204, 22) 75%, 
                        rgb(34, 197, 94) 100%)`
                    : 'hsl(var(--muted))'
                }}
              />
            </div>
          </div>

          {/* Price Changes */}
          <div className="space-y-1.5">
            {priceChanges.length > 0 ? (
              priceChanges.map(({ symbol, change }) => (
                <div key={symbol} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{symbol}</span>
                  <div className="flex items-center gap-1">
                    {getTrendIcon(change)}
                    <span className={getTrendColor(change)}>
                      {change > 0 ? '+' : ''}{change.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No price data available</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
