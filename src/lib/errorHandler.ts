export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on certain errors
      if (isNonRetryableError(error)) {
        throw error;
      }
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[ErrorHandler] Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError!;
};

export const handleAPIError = (error: any): string => {
  if (error.code === 'ECONNREFUSED') {
    return 'Connection refused - server unreachable';
  }

  if (error.code === 'ETIMEDOUT') {
    return 'Connection timed out';
  }

  if (error.message?.toLowerCase().includes('rate limit')) {
    return 'Rate limit exceeded - please wait';
  }

  if (error.message?.toLowerCase().includes('invalid api')) {
    return 'Invalid API credentials';
  }

  if (error.message?.toLowerCase().includes('permission')) {
    return 'Insufficient API permissions';
  }

  if (error.message?.toLowerCase().includes('insufficient balance')) {
    return 'Insufficient balance for this order';
  }

  if (error.message?.toLowerCase().includes('timestamp')) {
    return 'Clock synchronization error. Please check system time.';
  }

  if (error.message?.toLowerCase().includes('authentication')) {
    return 'Authentication failed - check API credentials';
  }

  return error.message || 'An unexpected error occurred';
};

export const isNetworkError = (error: any): boolean => {
  return (
    error.code === 'ECONNREFUSED' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ENOTFOUND' ||
    error.message?.includes('network') ||
    error.message?.includes('fetch')
  );
};

export const isNonRetryableError = (error: any): boolean => {
  const message = error.message?.toLowerCase() || '';
  
  return (
    message.includes('invalid api') ||
    message.includes('authentication') ||
    message.includes('permission') ||
    message.includes('insufficient balance') ||
    message.includes('order not found') ||
    message.includes('duplicate order')
  );
};

export const isRateLimitError = (error: any): boolean => {
  const message = error.message?.toLowerCase() || '';
  return (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    error.code === 429
  );
};

export const parseExchangeError = (error: any): {
  type: 'rate_limit' | 'auth' | 'balance' | 'network' | 'unknown';
  message: string;
  retryable: boolean;
} => {
  const message = error.message?.toLowerCase() || '';

  if (isRateLimitError(error)) {
    return {
      type: 'rate_limit',
      message: 'Rate limit exceeded - please wait',
      retryable: true
    };
  }

  if (message.includes('invalid api') || message.includes('authentication')) {
    return {
      type: 'auth',
      message: 'Invalid API credentials',
      retryable: false
    };
  }

  if (message.includes('insufficient balance')) {
    return {
      type: 'balance',
      message: 'Insufficient balance',
      retryable: false
    };
  }

  if (isNetworkError(error)) {
    return {
      type: 'network',
      message: 'Network error - check connection',
      retryable: true
    };
  }

  return {
    type: 'unknown',
    message: error.message || 'An unexpected error occurred',
    retryable: true
  };
};
