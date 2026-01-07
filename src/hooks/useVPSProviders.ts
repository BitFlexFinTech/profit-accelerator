import { useState, useMemo, useCallback } from 'react';
import {
  providers,
  getProvider,
  getAllProviderNames,
  getFreeTierProviders,
  getProviderPricingSummary,
  VPSProvider,
  ProviderCredentials,
  InstanceConfig,
  Instance,
  ProviderPricing,
  ProviderRegion,
  ValidationResult,
} from '@/services/vpsProviders';

interface ProviderInfo {
  name: string;
  displayName: string;
  regions: ProviderRegion[];
  pricing: Record<string, ProviderPricing>;
  hasFreeTier: boolean;
}

interface PricingSummary {
  provider: string;
  minMonthly: number;
  maxMonthly: number;
  hasFree: boolean;
}

interface UseVPSProvidersReturn {
  // Provider information
  providerList: ProviderInfo[];
  getProviderByName: (name: string) => VPSProvider | undefined;
  
  // Credentials management
  validateCredentials: (providerName: string, credentials: ProviderCredentials) => Promise<ValidationResult>;
  
  // Instance management
  createInstance: (providerName: string, config: InstanceConfig) => Promise<Instance>;
  deleteInstance: (providerName: string, instanceId: string) => Promise<void>;
  restartInstance: (providerName: string, instanceId: string) => Promise<void>;
  stopInstance: (providerName: string, instanceId: string) => Promise<void>;
  startInstance: (providerName: string, instanceId: string) => Promise<void>;
  
  // Pricing helpers
  getProviderPricing: (providerName: string) => Record<string, ProviderPricing> | undefined;
  freeTierProviders: VPSProvider[];
  pricingSummary: PricingSummary[];
  
  // State
  isLoading: boolean;
  error: Error | null;
}

export function useVPSProviders(): UseVPSProvidersReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Memoized provider list with full info
  const providerList = useMemo<ProviderInfo[]>(() => {
    const freeTierNames = getFreeTierProviders().map(p => p.name);
    return getAllProviderNames().map(name => {
      const provider = providers[name];
      return {
        name: provider.name,
        displayName: provider.displayName,
        regions: provider.regions,
        pricing: provider.pricing,
        hasFreeTier: freeTierNames.includes(provider.name),
      };
    });
  }, []);

  // Get provider instance by name
  const getProviderByName = useCallback((name: string): VPSProvider | undefined => {
    return getProvider(name);
  }, []);

  // Validate credentials
  const validateCredentials = useCallback(async (
    providerName: string,
    credentials: ProviderCredentials
  ): Promise<ValidationResult> => {
    const provider = getProvider(providerName);
    if (!provider) {
      return { valid: false, message: `Unknown provider: ${providerName}` };
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await provider.validateCredentials(credentials);
      return result;
    } catch (err: any) {
      const error = new Error(err.message || 'Validation failed');
      setError(error);
      return { valid: false, message: error.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create instance
  const createInstance = useCallback(async (
    providerName: string,
    config: InstanceConfig
  ): Promise<Instance> => {
    const provider = getProvider(providerName);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    setIsLoading(true);
    setError(null);

    try {
      const instance = await provider.createInstance(config);
      return instance;
    } catch (err: any) {
      const error = new Error(err.message || 'Failed to create instance');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Delete instance
  const deleteInstance = useCallback(async (
    providerName: string,
    instanceId: string
  ): Promise<void> => {
    const provider = getProvider(providerName);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    setIsLoading(true);
    setError(null);

    try {
      await provider.deleteInstance(instanceId);
    } catch (err: any) {
      const error = new Error(err.message || 'Failed to delete instance');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Restart instance
  const restartInstance = useCallback(async (
    providerName: string,
    instanceId: string
  ): Promise<void> => {
    const provider = getProvider(providerName);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    setIsLoading(true);
    setError(null);

    try {
      await provider.restartInstance(instanceId);
    } catch (err: any) {
      const error = new Error(err.message || 'Failed to restart instance');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Stop instance
  const stopInstance = useCallback(async (
    providerName: string,
    instanceId: string
  ): Promise<void> => {
    const provider = getProvider(providerName);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    setIsLoading(true);
    setError(null);

    try {
      await provider.stopInstance(instanceId);
    } catch (err: any) {
      const error = new Error(err.message || 'Failed to stop instance');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Start instance
  const startInstance = useCallback(async (
    providerName: string,
    instanceId: string
  ): Promise<void> => {
    const provider = getProvider(providerName);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    setIsLoading(true);
    setError(null);

    try {
      await provider.startInstance(instanceId);
    } catch (err: any) {
      const error = new Error(err.message || 'Failed to start instance');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get pricing for a specific provider
  const getProviderPricing = useCallback((providerName: string): Record<string, ProviderPricing> | undefined => {
    const provider = getProvider(providerName);
    return provider?.pricing;
  }, []);

  // Memoized free tier providers
  const freeTierProviders = useMemo(() => getFreeTierProviders(), []);

  // Memoized pricing summary
  const pricingSummary = useMemo(() => getProviderPricingSummary(), []);

  return {
    providerList,
    getProviderByName,
    validateCredentials,
    createInstance,
    deleteInstance,
    restartInstance,
    stopInstance,
    startInstance,
    getProviderPricing,
    freeTierProviders,
    pricingSummary,
    isLoading,
    error,
  };
}
