import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface TickerPrice {
  symbol: string;
  price: number;
  change24h: number;
  exchange: string;
}

const EXCHANGE_COLORS: Record<string, string> = {
  binance: '#F0B90B',
  okx: '#6366F1',
  bybit: '#F97316',
  bitget: '#22C55E',
  kucoin: '#06B6D4',
  mexc: '#3B82F6',
};

export function ScrollingPriceTicker() {
  const [prices, setPrices] = useState<TickerPrice[]>([]);
  const [connectedExchanges, setConnectedExchanges] = useState<string[]>([]);

  useEffect(() => {
    fetchConnectedExchanges();
    const interval = setInterval(fetchPrices, 2000);
    return () => clearInterval(interval);
  }, [connectedExchanges.length]);

  const fetchConnectedExchanges = async () => {
    try {
      const { data } = await supabase
        .from('exchange_connections')
        .select('exchange_name')
        .eq('is_connected', true);
      
      if (data) {
        setConnectedExchanges(data.map(e => e.exchange_name));
      }
    } catch (err) {
      console.error('[ScrollingPriceTicker] Error fetching exchanges:', err);
    }
  };

  const fetchPrices = async () => {
    if (connectedExchanges.length === 0) return;
    
    try {
      const { data } = await supabase.functions.invoke('trade-engine', {
        body: { 
          action: 'get-tickers',
          symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT']
        }
      });

      if (data?.tickers) {
        const tickerPrices: TickerPrice[] = data.tickers.map((t: any) => ({
          symbol: t.symbol.replace('USDT', ''),
          price: t.lastPrice,
          change24h: t.priceChange24h,
          exchange: t.exchange?.toLowerCase() || connectedExchanges[0]
        }));
        setPrices(tickerPrices);
      }
    } catch (err) {
      console.error('[ScrollingPriceTicker] Error:', err);
    }
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) {
      return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  if (prices.length === 0) {
    return null;
  }

  // Duplicate for seamless loop
  const duplicatedPrices = [...prices, ...prices, ...prices];

  return (
    <div className="w-full h-7 bg-card/80 border-b border-border/50 overflow-hidden flex-shrink-0">
      <div className="animate-scroll-left flex items-center h-full whitespace-nowrap">
        {duplicatedPrices.map((ticker, idx) => {
          const exchangeColor = EXCHANGE_COLORS[ticker.exchange] || '#64748B';
          const isPositive = ticker.change24h >= 0;
          
          return (
            <div 
              key={`${ticker.symbol}-${idx}`} 
              className="inline-flex items-center gap-2 px-4 border-r border-border/30"
            >
              <span 
                className="text-[10px] font-bold px-1 rounded"
                style={{ 
                  backgroundColor: `${exchangeColor}20`,
                  color: exchangeColor
                }}
              >
                {ticker.exchange.toUpperCase().slice(0, 3)}
              </span>
              <span className="text-xs font-semibold text-foreground">
                {ticker.symbol}
              </span>
              <span className="text-xs font-mono text-foreground">
                ${formatPrice(ticker.price)}
              </span>
              <span 
                className={`text-[10px] font-medium flex items-center gap-0.5 ${
                  isPositive ? 'text-success' : 'text-destructive'
                }`}
              >
                {isPositive ? (
                  <TrendingUp className="w-2.5 h-2.5" />
                ) : (
                  <TrendingDown className="w-2.5 h-2.5" />
                )}
                {isPositive ? '+' : ''}{ticker.change24h.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
