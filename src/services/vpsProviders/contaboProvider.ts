// Contabo Provider Implementation

import { BaseVPSProvider } from './baseProvider';
import type { ProviderCredentials, ValidationResult, ProviderRegion, ProviderPricing } from './types';
import { supabase } from '@/integrations/supabase/client';

export class ContaboProvider extends BaseVPSProvider {
  readonly name = 'contabo';
  readonly displayName = 'Contabo';

  readonly regions: ProviderRegion[] = [
    { id: 'EU', name: 'Germany (Nuremberg)', country: 'DE' },
    { id: 'US-central', name: 'US Central (St. Louis)', country: 'US' },
    { id: 'US-east', name: 'US East (New York)', country: 'US' },
    { id: 'US-west', name: 'US West (Seattle)', country: 'US' },
    { id: 'SIN', name: 'Singapore', country: 'SG', latencyEstimate: 15 },
    { id: 'AUS', name: 'Australia (Sydney)', country: 'AU' },
    { id: 'UK', name: 'United Kingdom', country: 'UK' },
    { id: 'JPN', name: 'Japan (Tokyo)', country: 'JP', latencyEstimate: 5 },
  ];

  readonly pricing: Record<string, ProviderPricing> = {
    small: { hourly: 0.0104, monthly: 6.99, name: 'VPS S SSD', isFree: false },
    medium: { hourly: 0.0163, monthly: 10.99, name: 'VPS M SSD', isFree: false },
    large: { hourly: 0.0237, monthly: 15.99, name: 'VPS L SSD', isFree: false },
  };

  async validateCredentials(credentials: ProviderCredentials): Promise<ValidationResult> {
    if (!credentials.contaboClientId || !credentials.contaboClientSecret) {
      return { valid: false, message: 'Contabo Client ID and Client Secret are required' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('contabo-cloud', {
        body: {
          action: 'validate-credentials',
          clientId: credentials.contaboClientId,
          clientSecret: credentials.contaboClientSecret,
          apiUser: credentials.contaboApiUser,
          apiPassword: credentials.contaboApiPassword,
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

export const contaboProvider = new ContaboProvider();
