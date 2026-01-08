import { TrendingUp, TrendingDown, RefreshCw, Loader2 } from 'lucide-react';
import { useMarketPrices } from '@/hooks/useMarketPrices';
import { formatDistanceToNow } from 'date-fns';

interface MarketWatchPanelProps {
  compact?: boolean;
  limit?: number;
}

export function MarketWatchPanel({ compact = false, limit = 3 }: MarketWatchPanelProps) {
  const { prices, lastUpdate, isLoading, error, refetch } = useMarketPrices(5000);

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
        <div className={`flex-1 ${compact ? 'space-y-1' : 'space-y-3'}`}>
          {coins.map(({ symbol, name, data }) => (
            <div
              key={symbol}
              className={`flex items-center justify-between ${compact ? 'p-1.5' : 'p-3'} rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors`}
            >
              <div className="flex items-center gap-2">
                <div className={`${compact ? 'w-7 h-7' : 'w-10 h-10'} rounded-lg bg-primary/20 flex items-center justify-center`}>
                  <span className={`font-bold text-primary ${compact ? 'text-[10px]' : 'text-sm'}`}>{symbol}</span>
                </div>
                <div>
                  <p className={`font-medium ${compact ? 'text-xs' : ''}`}>{name}</p>
                  {!compact && <p className="text-xs text-muted-foreground">{symbol}/USDT</p>}
                </div>
              </div>

              <div className="text-right">
                {isLoading && !data?.price ? (
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <p className={`font-mono font-bold ${compact ? 'text-xs' : ''}`}>
                      {formatPrice(data?.price || 0)}
                    </p>
                    <div className={`flex items-center gap-0.5 justify-end ${getChangeColor(data?.change24h || 0)}`}>
                      {(data?.change24h || 0) >= 0 ? (
                        <TrendingUp className="w-2.5 h-2.5" />
                      ) : (
                        <TrendingDown className="w-2.5 h-2.5" />
                      )}
                      <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-medium`}>
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
      )}
    </div>
  );
}
