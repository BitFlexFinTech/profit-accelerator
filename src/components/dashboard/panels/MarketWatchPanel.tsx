import { TrendingUp, TrendingDown, RefreshCw, Loader2, Newspaper, ExternalLink } from 'lucide-react';
import { useMarketPrices } from '@/hooks/useMarketPrices';
import { useCryptoNews } from '@/hooks/useCryptoNews';
import { formatDistanceToNow } from 'date-fns';

interface MarketWatchPanelProps {
  compact?: boolean;
  limit?: number;
}

export function MarketWatchPanel({ compact = false, limit = 3 }: MarketWatchPanelProps) {
  const { prices, lastUpdate, isLoading, error, refetch } = useMarketPrices(2000); // Faster 2s updates
  const { news, isLoading: newsLoading } = useCryptoNews(300000); // 5 min news updates

  const formatPrice = (price: number) => {
    return price.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-success';
    if (change < 0) return 'text-destructive';
    return 'text-muted-foreground';
  };

  const allCoins = [
    { symbol: 'BTC', name: 'Bitcoin', data: prices?.BTC },
    { symbol: 'ETH', name: 'Ethereum', data: prices?.ETH },
    { symbol: 'SOL', name: 'Solana', data: prices?.SOL }
  ];

  const coins = allCoins.slice(0, limit);

  return (
    <div className={`glass-card ${compact ? 'p-2' : 'p-6'} h-full flex flex-col`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-primary`} />
          <h3 className={`${compact ? 'text-sm' : 'text-lg'} font-semibold`}>Market Watch</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {lastUpdate && !compact && (
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(lastUpdate, { addSuffix: true })}
            </span>
          )}
          <button 
            onClick={refetch}
            className="p-1 hover:bg-secondary/50 rounded transition-colors"
            disabled={isLoading}
          >
            <RefreshCw className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="text-center py-2 text-destructive text-xs">
          {error}
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Prices Section */}
          <div className={`${compact ? 'space-y-1' : 'space-y-2'} flex-shrink-0`}>
            {coins.map(({ symbol, name, data }) => (
              <div
                key={symbol}
                className={`flex items-center justify-between ${compact ? 'p-1.5' : 'p-2'} rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors`}
              >
                <div className="flex items-center gap-2">
                  <div className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} rounded-lg bg-primary/20 flex items-center justify-center`}>
                    <span className={`font-bold text-primary ${compact ? 'text-[9px]' : 'text-xs'}`}>{symbol}</span>
                  </div>
                  <div>
                    <p className={`font-medium ${compact ? 'text-[10px]' : 'text-xs'}`}>{name}</p>
                  </div>
                </div>

                <div className="text-right">
                  {isLoading && !data?.price ? (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <p className={`font-mono font-bold ${compact ? 'text-[10px]' : 'text-xs'}`}>
                        {formatPrice(data?.price || 0)}
                      </p>
                      <div className={`flex items-center gap-0.5 justify-end ${getChangeColor(data?.change24h || 0)}`}>
                        {(data?.change24h || 0) >= 0 ? (
                          <TrendingUp className="w-2 h-2" />
                        ) : (
                          <TrendingDown className="w-2 h-2" />
                        )}
                        <span className="text-[9px] font-medium">
                          {(data?.change24h || 0) >= 0 ? '+' : ''}
                          {(data?.change24h || 0).toFixed(2)}%
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* News Section - Only show if not compact */}
          {!compact && news.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/50 flex-1 overflow-y-auto">
              <div className="flex items-center gap-1 mb-1.5">
                <Newspaper className="w-3 h-3 text-primary" />
                <span className="text-[10px] font-medium text-muted-foreground">Live News</span>
              </div>
              <div className="space-y-1">
                {news.slice(0, 3).map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-1.5 rounded bg-secondary/20 hover:bg-secondary/40 transition-colors group"
                  >
                    <div className="flex items-start gap-1">
                      <p className="text-[9px] leading-tight line-clamp-2 flex-1">
                        {item.title}
                      </p>
                      <ExternalLink className="w-2.5 h-2.5 text-muted-foreground group-hover:text-primary flex-shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[8px] text-primary font-medium">{item.source}</span>
                      <span className="text-[8px] text-muted-foreground">
                        {formatDistanceToNow(item.pubDate, { addSuffix: true })}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
