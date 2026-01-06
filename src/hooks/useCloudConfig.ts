import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface CloudConfig {
  id: string;
  provider: string;
  region: string;
  instance_type: string | null;
  use_free_tier: boolean;
  is_active: boolean;
  status: string;
}

export function useCloudConfig() {
  const [configs, setConfigs] = useState<CloudConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from('cloud_config')
        .select('id, provider, region, instance_type, use_free_tier, is_active, status')
        .order('provider');

      if (error) throw error;
      setConfigs(data || []);
    } catch (err) {
      console.error('Error fetching cloud configs:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch cloud configs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const getProviderConfig = (provider: string) => {
    return configs.find(c => c.provider === provider);
  };

  const saveProviderConfig = async (
    provider: string,
    credentials: Record<string, string>,
    options?: { region?: string; instanceType?: string; useFreeTier?: boolean }
  ) => {
    try {
      const existing = getProviderConfig(provider);
      
      const updateData = {
        credentials,
        region: options?.region || getDefaultRegion(provider),
        instance_type: options?.instanceType || getDefaultInstanceType(provider, options?.useFreeTier ?? true),
        use_free_tier: options?.useFreeTier ?? true,
        status: 'configured',
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await supabase
          .from('cloud_config')
          .update(updateData)
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('cloud_config')
          .insert({ provider, ...updateData });

        if (error) throw error;
      }

      // Log to audit
      await supabase.from('audit_logs').insert({
        action: 'cloud_config_updated',
        entity_type: 'config',
        entity_id: provider,
        new_value: { provider, region: updateData.region, status: 'configured' },
      });

      await fetchConfigs();
      return { success: true };
    } catch (err) {
      console.error('Error saving cloud config:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Failed to save' };
    }
  };

  const disconnectProvider = async (provider: string) => {
    try {
      const existing = getProviderConfig(provider);
      if (!existing) return { success: true };

      const { error } = await supabase
        .from('cloud_config')
        .update({
          credentials: null,
          is_active: false,
          status: 'not_configured',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) throw error;
      await fetchConfigs();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to disconnect' };
    }
  };

  const updateFreeTierPreference = async (useFreeTier: boolean) => {
    try {
      const { error } = await supabase
        .from('cloud_config')
        .update({ use_free_tier: useFreeTier, updated_at: new Date().toISOString() });

      if (error) throw error;
      await fetchConfigs();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to update' };
    }
  };

  return {
    configs,
    isLoading,
    error,
    getProviderConfig,
    saveProviderConfig,
    disconnectProvider,
    updateFreeTierPreference,
    refetch: fetchConfigs,
  };
}

function getDefaultRegion(provider: string): string {
  switch (provider) {
    case 'aws': return 'ap-northeast-1';
    case 'gcp': return 'asia-northeast1';
    case 'digitalocean': return 'sgp1';
    default: return 'ap-northeast-1';
  }
}

function getDefaultInstanceType(provider: string, freeTier: boolean): string {
  switch (provider) {
    case 'aws': return freeTier ? 't4g.micro' : 't4g.small';
    case 'gcp': return freeTier ? 'e2-micro' : 'e2-small';
    case 'digitalocean': return freeTier ? 's-1vcpu-512mb-10gb' : 's-1vcpu-1gb';
    default: return '';
  }
}
