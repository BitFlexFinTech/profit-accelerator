import { TrendingUp, TrendingDown, RefreshCw, Loader2, Newspaper, ExternalLink } from 'lucide-react';
import { useMarketPrices } from '@/hooks/useMarketPrices';
import { useCryptoNews } from '@/hooks/useCryptoNews';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IconContainer } from '@/components/ui/IconContainer';

interface MarketWatchPanelProps {
  compact?: boolean;
  limit?: number;
}

export function MarketWatchPanel({ compact = false, limit = 3 }: MarketWatchPanelProps) {
  const { prices, lastUpdate, isLoading, error, refetch } = useMarketPrices(2000);
  const { news, isLoading: newsLoading } = useCryptoNews(300000);

  const formatPrice = (price: number) => {
    return price.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-green-400';
    if (change < 0) return 'text-red-400';
    return 'text-muted-foreground';
  };

  const allCoins = [
    { symbol: 'BTC', name: 'Bitcoin', data: prices?.BTC },
    { symbol: 'ETH', name: 'Ethereum', data: prices?.ETH },
    { symbol: 'SOL', name: 'Solana', data: prices?.SOL }
  ];

  const coins = allCoins.slice(0, limit);

  return (
    <div className={cn(
      "card-cyan glass-card h-full flex flex-col",
      "hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-300",
      compact ? 'p-2' : 'p-6'
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <IconContainer color="cyan" size="sm">
            <TrendingUp className={compact ? "w-3 h-3" : "w-4 h-4"} />
          </IconContainer>
          <h3 className={cn("font-semibold", compact ? 'text-sm' : 'text-lg')}>Market Watch</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {lastUpdate && !compact && (
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(lastUpdate, { addSuffix: true })}
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button 
                onClick={refetch}
                className={cn(
                  "p-1 rounded transition-colors",
                  "hover:bg-cyan-500/10"
                )}
                disabled={isLoading}
              >
                <RefreshCw className={cn(
                  compact ? 'w-3 h-3' : 'w-4 h-4',
                  "text-muted-foreground",
                  isLoading && 'animate-spin'
                )} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Refresh market data</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {error ? (
        <div className="text-center py-2 text-red-400 text-xs">
          {error}
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Prices Section */}
          <div className={cn("flex-shrink-0", compact ? 'space-y-1' : 'space-y-2')}>
            {coins.map(({ symbol, name, data }) => (
              <div
                key={symbol}
                className={cn(
                  "flex items-center justify-between rounded-lg transition-colors",
                  "bg-cyan-500/5 hover:bg-cyan-500/15",
                  compact ? 'p-1.5' : 'p-2'
                )}
              >
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "rounded-lg bg-cyan-500/20 flex items-center justify-center",
                    compact ? 'w-6 h-6' : 'w-8 h-8'
                  )}>
                    <span className={cn("font-bold text-cyan-400", compact ? 'text-[9px]' : 'text-xs')}>
                      {symbol}
                    </span>
                  </div>
                  <div>
                    <p className={cn("font-medium", compact ? 'text-[10px]' : 'text-xs')}>{name}</p>
                  </div>
                </div>

                <div className="text-right">
                  {isLoading && !data?.price ? (
                    <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                  ) : (
                    <>
                      <p className={cn("font-mono font-bold", compact ? 'text-[10px]' : 'text-xs')}>
                        {formatPrice(data?.price || 0)}
                      </p>
                      <div className={cn(
                        "flex items-center gap-0.5 justify-end",
                        getChangeColor(data?.change24h || 0)
                      )}>
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
          
          {/* News Section */}
          {!compact && news.length > 0 && (
            <div className="mt-2 pt-2 border-t border-cyan-500/20 flex-1 overflow-y-auto">
              <div className="flex items-center gap-1 mb-1.5">
                <Newspaper className="w-3 h-3 text-cyan-400" />
                <span className="text-[10px] font-medium text-muted-foreground">Live News</span>
              </div>
              <div className="space-y-1">
                {news.slice(0, 3).map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "block p-1.5 rounded transition-colors group",
                      "bg-cyan-500/5 hover:bg-cyan-500/15"
                    )}
                  >
                    <div className="flex items-start gap-1">
                      <p className="text-[9px] leading-tight line-clamp-2 flex-1">
                        {item.title}
                      </p>
                      <ExternalLink className="w-2.5 h-2.5 text-muted-foreground group-hover:text-cyan-400 flex-shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[8px] text-cyan-400 font-medium">{item.source}</span>
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
