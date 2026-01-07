import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Activity, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

interface PriceChange {
  symbol: string;
  change: number;
  price: number;
  exchange: string;
}

export function SentimentPanel() {
  const [sentimentIndex, setSentimentIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [connectedExchange, setConnectedExchange] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchExchangePrices = async () => {
    try {
      // Check connected exchanges
      const { data: exchanges } = await supabase
        .from('exchange_connections')
        .select('exchange_name, is_connected')
        .eq('is_connected', true);

      if (!exchanges?.length) {
        setPriceChanges([]);
        setSentimentIndex(null);
        setConnectedExchange(null);
        return;
      }

      setConnectedExchange(exchanges[0].exchange_name);

      // Call trade-engine to get real ticker data from connected exchanges
      const { data, error } = await supabase.functions.invoke('trade-engine', {
        body: { 
          action: 'get-tickers',
          symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']
        }
      });

      if (error) throw error;

      if (data?.tickers && data.tickers.length > 0) {
        const prices = data.tickers.map((t: { symbol: string; priceChange24h: number; lastPrice: number; exchange: string }) => ({
          symbol: t.symbol.replace('USDT', ''),
          change: t.priceChange24h,
          price: t.lastPrice,
          exchange: t.exchange
        }));
        
        setPriceChanges(prices);

        // Calculate sentiment based on connected exchange price movements
        // Map average change to 0-100 scale: -10% = 0, +10% = 100, 0% = 50
        const avgChange = prices.reduce((sum: number, p: PriceChange) => sum + p.change, 0) / prices.length;
        const sentiment = Math.min(100, Math.max(0, 50 + (avgChange * 5)));
        setSentimentIndex(Math.round(sentiment));
      } else {
        setPriceChanges([]);
        setSentimentIndex(null);
      }
    } catch (error) {
      console.error('[SentimentPanel] Error:', error);
      setPriceChanges([]);
      setSentimentIndex(null);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchExchangePrices();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchExchangePrices, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchExchangePrices();
  };

  const getSentimentLabel = (index: number | null) => {
    if (index === null) return 'No Data';
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
    <div className="glass-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-violet-400" />
          <span className="font-medium text-sm">Market Sentiment</span>
          {connectedExchange && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary uppercase">
              {connectedExchange}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="h-6 w-6 p-0"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-6 bg-secondary/50 rounded w-16" />
          <div className="h-4 bg-secondary/50 rounded w-24" />
        </div>
      ) : !connectedExchange ? (
        <div className="text-xs text-muted-foreground py-2">
          Connect an exchange to see sentiment
        </div>
      ) : (
        <>
          {/* Sentiment Index */}
          <div className="mb-2">
            <div className="flex items-baseline gap-2">
              <span className={`text-xl font-bold ${getSentimentColor(sentimentIndex)}`}>
                {sentimentIndex ?? '--'}
              </span>
              <span className={`text-[10px] ${getSentimentColor(sentimentIndex)}`}>
                {getSentimentLabel(sentimentIndex)}
              </span>
            </div>
            
            {/* Gauge bar */}
            <div className="mt-1.5 h-1 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full transition-all duration-500 rounded-full"
                style={{ 
                  width: `${sentimentIndex ?? 0}%`,
                  background: sentimentIndex !== null 
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
          <div className="space-y-1">
            {priceChanges.length > 0 ? (
              priceChanges.map(({ symbol, change, price }) => (
                <div key={symbol} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{symbol}</span>
                    <span className="text-muted-foreground">
                      ${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {getTrendIcon(change)}
                    <span className={getTrendColor(change)}>
                      {change > 0 ? '+' : ''}{change.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">Fetching prices...</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}