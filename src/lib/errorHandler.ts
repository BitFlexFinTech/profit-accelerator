export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
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
