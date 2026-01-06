import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PriceData {
  price: number;
  change24h: number;
}

interface MarketPrices {
  BTC: PriceData;
  ETH: PriceData;
  SOL: PriceData;
}

interface UseMarketPricesReturn {
  prices: MarketPrices | null;
  lastUpdate: Date | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const DEFAULT_PRICES: MarketPrices = {
  BTC: { price: 0, change24h: 0 },
  ETH: { price: 0, change24h: 0 },
  SOL: { price: 0, change24h: 0 }
};

export function useMarketPrices(refreshInterval = 5000): UseMarketPricesReturn {
  const [prices, setPrices] = useState<MarketPrices | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrices = useCallback(async () => {
    try {
      const response = await supabase.functions.invoke('trade-engine', {
        body: { action: 'get-prices' }
      });

      if (response.data?.success) {
        setPrices(response.data.prices);
        setLastUpdate(new Date(response.data.timestamp));
        setError(null);
      } else {
        setError(response.data?.error || 'Failed to fetch prices');
      }
    } catch (err) {
      console.error('[useMarketPrices] Error:', err);
      setError('Failed to connect to price feed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();

    const interval = setInterval(fetchPrices, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchPrices, refreshInterval]);

  return {
    prices: prices || DEFAULT_PRICES,
    lastUpdate,
    isLoading,
    error,
    refetch: fetchPrices
  };
}
