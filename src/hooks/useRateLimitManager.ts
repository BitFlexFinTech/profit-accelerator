import { useState, useCallback, useRef, useEffect } from 'react';

interface RateLimitConfig {
  maxRequestsPerMinute: number;
  safetyMarginPercent: number; // e.g., 80 = 80% of max
  burstReservePercent: number; // Reserve for critical operations
}

interface RequestMetrics {
  requestsThisMinute: number;
  requestsThisSecond: number;
  lastResetMinute: number;
  lastResetSecond: number;
}

interface QueuedRequest {
  id: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timestamp: number;
}

const EXCHANGE_LIMITS: Record<string, RateLimitConfig> = {
  binance: {
    maxRequestsPerMinute: 1200, // Official: 1200/min
    safetyMarginPercent: 80,   // Use only 80% = 960/min
    burstReservePercent: 20,   // Reserve 20% for critical
  },
  okx: {
    maxRequestsPerMinute: 3000, // Official: 3000/min
    safetyMarginPercent: 80,    // Use only 80% = 2400/min
    burstReservePercent: 20,
  },
};

export function useRateLimitManager(exchange: 'binance' | 'okx') {
  const config = EXCHANGE_LIMITS[exchange];
  const effectiveLimit = Math.floor(config.maxRequestsPerMinute * (config.safetyMarginPercent / 100));
  const effectiveLimitPerSecond = Math.floor(effectiveLimit / 60);

  const [metrics, setMetrics] = useState<RequestMetrics>({
    requestsThisMinute: 0,
    requestsThisSecond: 0,
    lastResetMinute: Date.now(),
    lastResetSecond: Date.now(),
  });

  const [isThrottled, setIsThrottled] = useState(false);
  const [webSocketOnlyMode, setWebSocketOnlyMode] = useState(false);
  const queueRef = useRef<QueuedRequest[]>([]);
  const processingRef = useRef(false);

  // Reset counters
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      
      setMetrics(prev => {
        const newMetrics = { ...prev };
        
        // Reset per-second counter
        if (now - prev.lastResetSecond >= 1000) {
          newMetrics.requestsThisSecond = 0;
          newMetrics.lastResetSecond = now;
        }
        
        // Reset per-minute counter
        if (now - prev.lastResetMinute >= 60000) {
          newMetrics.requestsThisMinute = 0;
          newMetrics.lastResetMinute = now;
          
          // Exit WebSocket-only mode on reset
          if (webSocketOnlyMode) {
            setWebSocketOnlyMode(false);
          }
        }
        
        return newMetrics;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [webSocketOnlyMode]);

  // Check if we can make a request
  const canMakeRequest = useCallback((priority: 'critical' | 'high' | 'normal' | 'low' = 'normal'): boolean => {
    // Critical requests can always go through (from burst reserve)
    if (priority === 'critical') {
      return metrics.requestsThisMinute < config.maxRequestsPerMinute;
    }

    // WebSocket-only mode blocks all REST except critical
    if (webSocketOnlyMode) {
      return false;
    }

    // Check per-second limit
    if (metrics.requestsThisSecond >= effectiveLimitPerSecond) {
      return false;
    }

    // Check per-minute limit
    if (metrics.requestsThisMinute >= effectiveLimit) {
      return false;
    }

    return true;
  }, [metrics, effectiveLimit, effectiveLimitPerSecond, webSocketOnlyMode, config.maxRequestsPerMinute]);

  // Record a request
  const recordRequest = useCallback(() => {
    setMetrics(prev => {
      const newMinute = prev.requestsThisMinute + 1;
      const newSecond = prev.requestsThisSecond + 1;
      
      // Check if we need to activate throttling
      const usagePercent = (newMinute / effectiveLimit) * 100;
      
      if (usagePercent >= 95) {
        setWebSocketOnlyMode(true);
      } else if (usagePercent >= 85) {
        setIsThrottled(true);
      } else if (usagePercent < 75) {
        setIsThrottled(false);
      }
      
      return {
        ...prev,
        requestsThisMinute: newMinute,
        requestsThisSecond: newSecond,
      };
    });
  }, [effectiveLimit]);

  // Execute a rate-limited request
  const executeRequest = useCallback(async <T>(
    request: () => Promise<T>,
    priority: 'critical' | 'high' | 'normal' | 'low' = 'normal'
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      // If we can make the request now, do it
      if (canMakeRequest(priority)) {
        recordRequest();
        request().then(resolve).catch(reject);
        return;
      }

      // Otherwise, queue it
      const queuedRequest: QueuedRequest = {
        id: `${Date.now()}-${Math.random()}`,
        priority,
        execute: request,
        resolve,
        reject,
        timestamp: Date.now(),
      };

      queueRef.current.push(queuedRequest);
      
      // Sort queue by priority
      queueRef.current.sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
    });
  }, [canMakeRequest, recordRequest]);

  // Process queue
  useEffect(() => {
    const processQueue = async () => {
      if (processingRef.current || queueRef.current.length === 0) return;
      
      processingRef.current = true;
      
      while (queueRef.current.length > 0) {
        const next = queueRef.current[0];
        
        // Wait until we can make the request
        while (!canMakeRequest(next.priority)) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Remove from queue and execute
        queueRef.current.shift();
        recordRequest();
        
        try {
          const result = await next.execute();
          next.resolve(result);
        } catch (err) {
          next.reject(err);
        }
      }
      
      processingRef.current = false;
    };

    const interval = setInterval(processQueue, 100);
    return () => clearInterval(interval);
  }, [canMakeRequest, recordRequest]);

  // Get current usage stats
  const getUsageStats = useCallback(() => {
    const usagePercent = (metrics.requestsThisMinute / effectiveLimit) * 100;
    const remaining = effectiveLimit - metrics.requestsThisMinute;
    const timeUntilReset = 60000 - (Date.now() - metrics.lastResetMinute);
    
    return {
      exchange,
      requestsThisMinute: metrics.requestsThisMinute,
      limit: effectiveLimit,
      hardLimit: config.maxRequestsPerMinute,
      usagePercent: Math.min(100, usagePercent),
      remaining,
      timeUntilResetMs: Math.max(0, timeUntilReset),
      isThrottled,
      webSocketOnlyMode,
      queueLength: queueRef.current.length,
    };
  }, [metrics, effectiveLimit, config.maxRequestsPerMinute, exchange, isThrottled, webSocketOnlyMode]);

  return {
    canMakeRequest,
    executeRequest,
    recordRequest,
    getUsageStats,
    isThrottled,
    webSocketOnlyMode,
  };
}
