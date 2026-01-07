// DigitalOcean Provider Implementation

import { BaseVPSProvider } from './baseProvider';
import type { ProviderCredentials, ValidationResult, ProviderRegion, ProviderPricing } from './types';
import { supabase } from '@/integrations/supabase/client';

export class DigitalOceanProvider extends BaseVPSProvider {
  readonly name = 'digitalocean';
  readonly displayName = 'DigitalOcean';

  readonly regions: ProviderRegion[] = [
    { id: 'nyc1', name: 'New York 1', country: 'US' },
    { id: 'nyc3', name: 'New York 3', country: 'US' },
    { id: 'sfo3', name: 'San Francisco 3', country: 'US' },
    { id: 'ams3', name: 'Amsterdam 3', country: 'NL' },
    { id: 'sgp1', name: 'Singapore 1', country: 'SG', latencyEstimate: 10 },
    { id: 'lon1', name: 'London 1', country: 'UK' },
    { id: 'fra1', name: 'Frankfurt 1', country: 'DE' },
    { id: 'tor1', name: 'Toronto 1', country: 'CA' },
    { id: 'blr1', name: 'Bangalore 1', country: 'IN' },
    { id: 'syd1', name: 'Sydney 1', country: 'AU' },
  ];

  readonly pricing: Record<string, ProviderPricing> = {
    small: { hourly: 0.00595, monthly: 4.00, name: 's-1vcpu-1gb', isFree: false },
    medium: { hourly: 0.02976, monthly: 20.00, name: 's-2vcpu-4gb', isFree: false },
    large: { hourly: 0.05952, monthly: 40.00, name: 's-4vcpu-8gb', isFree: false },
  };

  async validateCredentials(credentials: ProviderCredentials): Promise<ValidationResult> {
    if (!credentials.digitalOceanToken) {
      return { valid: false, message: 'DigitalOcean API Token is required' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('digitalocean-cloud', {
        body: {
          action: 'validate-credentials',
          token: credentials.digitalOceanToken,
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

export const digitalOceanProvider = new DigitalOceanProvider();
