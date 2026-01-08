import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Activity, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IconContainer } from '@/components/ui/IconContainer';

interface PriceChange {
  symbol: string;
  change: number;
  price: number;
  exchange: string;
}

interface SentimentPanelProps {
  compact?: boolean;
  className?: string;
}

export function SentimentPanel({ compact = false, className }: SentimentPanelProps) {
  const [sentimentIndex, setSentimentIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [connectedExchange, setConnectedExchange] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchExchangePrices = async () => {
    try {
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

      const { data, error } = await supabase.functions.invoke('trade-engine', {
        body: { 
          action: 'get-tickers',
          symbols: compact 
            ? ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT']
            : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'XRPUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT']
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
    const interval = setInterval(fetchExchangePrices, 60 * 1000);
    return () => clearInterval(interval);
  }, [compact]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchExchangePrices();
  };

  const getSentimentLabel = (index: number | null) => {
    if (index === null) return 'N/A';
    if (index <= 25) return 'Fear';
    if (index <= 45) return 'Caution';
    if (index <= 55) return 'Neutral';
    if (index <= 75) return 'Greed';
    return 'Euphoria';
  };

  const getSentimentColor = (index: number | null) => {
    if (index === null) return 'text-muted-foreground';
    if (index <= 25) return 'text-red-400';
    if (index <= 45) return 'text-yellow-400';
    if (index <= 55) return 'text-yellow-500';
    if (index <= 75) return 'text-lime-400';
    return 'text-green-400';
  };

  const getTrendIcon = (change: number) => {
    if (change > 0.5) return <TrendingUp className="w-2.5 h-2.5 text-green-400" />;
    if (change < -0.5) return <TrendingDown className="w-2.5 h-2.5 text-red-400" />;
    return <Minus className="w-2.5 h-2.5 text-muted-foreground" />;
  };

  const getTrendColor = (change: number) => {
    if (change > 0.5) return 'text-green-400';
    if (change < -0.5) return 'text-red-400';
    return 'text-muted-foreground';
  };

  const displayPrices = compact ? priceChanges.slice(0, 4) : priceChanges;

  return (
    <div className={cn(
      "card-magenta glass-card p-2 h-full flex flex-col",
      "hover:shadow-lg hover:shadow-fuchsia-500/10 transition-all duration-300",
      className
    )}>
      <div className="flex items-center justify-between mb-1 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <IconContainer color="magenta" size="sm">
            <Activity className="w-2.5 h-2.5" />
          </IconContainer>
          <span className="font-medium text-xs">Sentiment</span>
          {connectedExchange && (
            <span className="px-1 py-0 rounded bg-fuchsia-500/20 text-fuchsia-400 uppercase text-[8px]">
              {connectedExchange}
            </span>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-5 w-5 p-0"
            >
              <RefreshCw className={cn("w-2.5 h-2.5", isRefreshing && "animate-spin")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh sentiment data</TooltipContent>
        </Tooltip>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-1 flex-1">
          <div className="h-4 bg-fuchsia-500/10 rounded w-12" />
          <div className="h-3 bg-fuchsia-500/10 rounded w-16" />
        </div>
      ) : !connectedExchange ? (
        <div className="text-[10px] text-muted-foreground py-1">
          Connect exchange
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Sentiment Index */}
          <div className="mb-1 flex-shrink-0">
            <div className="flex items-baseline gap-1.5">
              <span className={cn("text-lg font-bold", getSentimentColor(sentimentIndex))}>
                {sentimentIndex ?? '--'}
              </span>
              <span className={cn("text-[9px]", getSentimentColor(sentimentIndex))}>
                {getSentimentLabel(sentimentIndex)}
              </span>
            </div>
            
            {/* Gauge bar */}
            <div className="mt-0.5 h-0.5 bg-fuchsia-500/10 rounded-full overflow-hidden">
              <div 
                className="h-full transition-all duration-500 rounded-full"
                style={{ 
                  width: `${sentimentIndex ?? 0}%`,
                  background: sentimentIndex !== null 
                    ? `linear-gradient(90deg, rgb(239, 68, 68) 0%, rgb(249, 115, 22) 25%, rgb(234, 179, 8) 50%, rgb(132, 204, 22) 75%, rgb(34, 197, 94) 100%)`
                    : 'hsl(var(--muted))'
                }}
              />
            </div>
          </div>

          {/* Price Changes */}
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {displayPrices.length > 0 ? (
              displayPrices.map(({ symbol, change, price }) => (
                <div 
                  key={symbol} 
                  className={cn(
                    "flex items-center justify-between text-[10px] px-1 py-0.5 rounded",
                    "hover:bg-fuchsia-500/10 transition-colors"
                  )}
                >
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{symbol}</span>
                    <span className="text-muted-foreground">
                      ${price >= 1000 ? (price / 1000).toFixed(1) + 'k' : price.toFixed(0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {getTrendIcon(change)}
                    <span className={getTrendColor(change)}>
                      {change > 0 ? '+' : ''}{change.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[9px] text-muted-foreground">Loading...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
