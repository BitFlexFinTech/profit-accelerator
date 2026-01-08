import { useState, useEffect, useCallback, useRef } from 'react';
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

// Increased interval from 2s to 15s for performance optimization
export function useMarketPrices(refreshInterval = 15000): UseMarketPricesReturn {
  const [prices, setPrices] = useState<MarketPrices | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const fetchingRef = useRef(false);

  // Track tab visibility to pause polling when hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const fetchPrices = useCallback(async () => {
    // Prevent concurrent requests
    if (fetchingRef.current) return;
    fetchingRef.current = true;

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
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchPrices();

    // Only poll when tab is visible
    if (!isTabVisible) return;

    const interval = setInterval(fetchPrices, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchPrices, refreshInterval, isTabVisible]);

  return {
    prices: prices || DEFAULT_PRICES,
    lastUpdate,
    isLoading,
    error,
    refetch: fetchPrices
  };
}