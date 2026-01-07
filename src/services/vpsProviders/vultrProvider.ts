// Vultr Provider Implementation

import { BaseVPSProvider } from './baseProvider';
import type { ProviderCredentials, ValidationResult, ProviderRegion, ProviderPricing } from './types';
import { supabase } from '@/integrations/supabase/client';

export class VultrProvider extends BaseVPSProvider {
  readonly name = 'vultr';
  readonly displayName = 'Vultr';

  readonly regions: ProviderRegion[] = [
    { id: 'ewr', name: 'New Jersey', country: 'US' },
    { id: 'ord', name: 'Chicago', country: 'US' },
    { id: 'dfw', name: 'Dallas', country: 'US' },
    { id: 'lax', name: 'Los Angeles', country: 'US' },
    { id: 'atl', name: 'Atlanta', country: 'US' },
    { id: 'mia', name: 'Miami', country: 'US' },
    { id: 'sea', name: 'Seattle', country: 'US' },
    { id: 'ams', name: 'Amsterdam', country: 'NL' },
    { id: 'lhr', name: 'London', country: 'UK' },
    { id: 'fra', name: 'Frankfurt', country: 'DE' },
    { id: 'cdg', name: 'Paris', country: 'FR' },
    { id: 'nrt', name: 'Tokyo', country: 'JP', latencyEstimate: 5 },
    { id: 'sgp', name: 'Singapore', country: 'SG', latencyEstimate: 15 },
    { id: 'syd', name: 'Sydney', country: 'AU' },
    { id: 'icn', name: 'Seoul', country: 'KR', latencyEstimate: 8 },
  ];

  readonly pricing: Record<string, ProviderPricing> = {
    small: { hourly: 0.00744, monthly: 5.00, name: 'vc2-1c-1gb', isFree: false },
    medium: { hourly: 0.02976, monthly: 20.00, name: 'vc2-2c-4gb', isFree: false },
    large: { hourly: 0.05952, monthly: 40.00, name: 'vc2-4c-8gb', isFree: false },
  };

  async validateCredentials(credentials: ProviderCredentials): Promise<ValidationResult> {
    if (!credentials.vultrApiKey) {
      return { valid: false, message: 'Vultr API Key is required' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('vultr-cloud', {
        body: {
          action: 'validate-credentials',
          apiKey: credentials.vultrApiKey,
        },
      });

      if (error) {
        return { valid: false, message: error.message };
      }

      return { valid: data?.valid || false, message: data?.message };
    } catch (err) {
      return { valid: false, message: err instanceof Error ? err.message : 'Validation failed' };
    }
  }
}

export const vultrProvider = new VultrProvider();
