import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type SetupStep = 
  | 'idle'
  | 'credentials'
  | 'validating'
  | 'deploying'
  | 'installing'
  | 'verifying'
  | 'success'
  | 'error';

interface SetupProgress {
  id?: string;
  provider: string;
  step: SetupStep;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  errorMessage: string | null;
  instanceId: string | null;
  publicIp: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UseSetupProgressOptions {
  provider: string;
  autoLoad?: boolean;
}

export function useSetupProgress({ provider, autoLoad = true }: UseSetupProgressOptions) {
  const [progress, setProgress] = useState<SetupProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

  // Load existing progress from database
  const loadProgress = useCallback(async () => {
    setIsLoading(true);
    try {
      // Query using RPC or direct query since setup_progress table may not exist yet
      const { data, error } = await supabase
        .from('vps_config')
        .select('*')
        .eq('provider', provider)
        .maybeSingle();

      if (data) {
        // Map VPS config to progress format
        setProgress({
          id: data.id,
          provider: data.provider,
          step: data.status === 'running' ? 'success' : 'idle',
          status: data.status === 'running' ? 'completed' : 'pending',
          errorMessage: null,
          instanceId: null,
          publicIp: data.outbound_ip,
          createdAt: data.created_at || new Date().toISOString(),
          updatedAt: data.updated_at || new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('[SetupProgress] Load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [provider]);

  // Update progress
  const updateProgress = useCallback(async (updates: Partial<SetupProgress>) => {
    setProgress(prev => {
      if (!prev) {
        return {
          provider,
          step: 'idle',
          status: 'pending',
          errorMessage: null,
          instanceId: null,
          publicIp: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...updates,
        };
      }
      return {
        ...prev,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
    });
  }, [provider]);

  // Set step with error handling
  const setStep = useCallback(async (
    step: SetupStep,
    additionalData?: { instanceId?: string; publicIp?: string; errorMessage?: string }
  ) => {
    const status = step === 'success' ? 'completed' : 
                   step === 'error' ? 'failed' : 
                   step === 'idle' ? 'pending' : 'in_progress';
    
    await updateProgress({
      step,
      status,
      ...additionalData,
    });
  }, [updateProgress]);

  // Handle retry logic
  const handleRetry = useCallback(async (
    operation: () => Promise<void>,
    stepName: SetupStep
  ) => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await setStep(stepName);
        await operation();
        return true;
      } catch (err: any) {
        console.error(`[SetupProgress] ${stepName} attempt ${attempt + 1} failed:`, err);
        setRetryCount(attempt + 1);
        
        if (attempt === MAX_RETRIES) {
          await setStep('error', {
            errorMessage: `Failed after ${MAX_RETRIES + 1} attempts: ${err.message}`,
          });
          return false;
        }
        
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
    return false;
  }, [setStep]);

  // Reset progress
  const reset = useCallback(() => {
    setProgress(null);
    setRetryCount(0);
  }, []);

  // Mark as complete
  const complete = useCallback(async (instanceId: string, publicIp: string) => {
    await setStep('success', { instanceId, publicIp });
    setRetryCount(0);
  }, [setStep]);

  // Check if can resume from a previous session
  const canResume = progress?.status === 'in_progress' || progress?.status === 'failed';

  useEffect(() => {
    if (autoLoad) {
      loadProgress();
    }
  }, [autoLoad, loadProgress]);

  return {
    progress,
    isLoading,
    retryCount,
    canResume,
    loadProgress,
    updateProgress,
    setStep,
    handleRetry,
    reset,
    complete,
  };
}
