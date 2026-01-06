import { TrendingUp, TrendingDown, RefreshCw, Loader2 } from 'lucide-react';
import { useMarketPrices } from '@/hooks/useMarketPrices';
import { formatDistanceToNow } from 'date-fns';

export function MarketWatchPanel() {
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

  const coins = [
    { symbol: 'BTC', name: 'Bitcoin', data: prices?.BTC },
    { symbol: 'ETH', name: 'Ethereum', data: prices?.ETH },
    { symbol: 'SOL', name: 'Solana', data: prices?.SOL }
  ];

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Market Watch</h3>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(lastUpdate, { addSuffix: true })}
            </span>
          )}
          <button 
            onClick={refetch}
            className="p-1 hover:bg-secondary/50 rounded transition-colors"
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="text-center py-4 text-destructive text-sm">
          {error}
        </div>
      ) : (
        <div className="space-y-3">
          {coins.map(({ symbol, name, data }) => (
            <div
              key={symbol}
              className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <span className="font-bold text-primary text-sm">{symbol}</span>
                </div>
                <div>
                  <p className="font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground">{symbol}/USDT</p>
                </div>
              </div>

              <div className="text-right">
                {isLoading && !data?.price ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <p className="font-mono font-bold">
                      {formatPrice(data?.price || 0)}
                    </p>
                    <div className={`flex items-center gap-1 justify-end ${getChangeColor(data?.change24h || 0)}`}>
                      {(data?.change24h || 0) >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      <span className="text-xs font-medium">
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
