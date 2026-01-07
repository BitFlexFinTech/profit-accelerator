// Oracle Cloud Provider Implementation

import { BaseVPSProvider } from './baseProvider';
import type { ProviderCredentials, ValidationResult, ProviderRegion, ProviderPricing } from './types';
import { supabase } from '@/integrations/supabase/client';

export class OracleProvider extends BaseVPSProvider {
  readonly name = 'oracle';
  readonly displayName = 'Oracle Cloud';

  readonly regions: ProviderRegion[] = [
    { id: 'us-ashburn-1', name: 'Ashburn', country: 'US' },
    { id: 'us-phoenix-1', name: 'Phoenix', country: 'US' },
    { id: 'us-sanjose-1', name: 'San Jose', country: 'US' },
    { id: 'eu-frankfurt-1', name: 'Frankfurt', country: 'DE' },
    { id: 'eu-amsterdam-1', name: 'Amsterdam', country: 'NL' },
    { id: 'uk-london-1', name: 'London', country: 'UK' },
    { id: 'ap-tokyo-1', name: 'Tokyo', country: 'JP', latencyEstimate: 5 },
    { id: 'ap-osaka-1', name: 'Osaka', country: 'JP', latencyEstimate: 8 },
    { id: 'ap-singapore-1', name: 'Singapore', country: 'SG', latencyEstimate: 15 },
    { id: 'ap-sydney-1', name: 'Sydney', country: 'AU' },
    { id: 'ap-seoul-1', name: 'Seoul', country: 'KR', latencyEstimate: 10 },
    { id: 'ap-mumbai-1', name: 'Mumbai', country: 'IN' },
  ];

  readonly pricing: Record<string, ProviderPricing> = {
    small: { hourly: 0, monthly: 0, name: 'VM.Standard.E2.1.Micro', isFree: true },
    medium: { hourly: 0, monthly: 0, name: 'VM.Standard.A1.Flex', isFree: true },
    large: { hourly: 0.0425, monthly: 30.60, name: 'VM.Standard.E4.Flex', isFree: false },
  };

  async validateCredentials(credentials: ProviderCredentials): Promise<ValidationResult> {
    if (!credentials.oracleUserOcid || !credentials.oracleTenancyOcid || !credentials.oracleFingerprint) {
      return { valid: false, message: 'Oracle User OCID, Tenancy OCID, and Fingerprint are required' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('oracle-cloud', {
        body: {
          action: 'validate-credentials',
          userOcid: credentials.oracleUserOcid,
          tenancyOcid: credentials.oracleTenancyOcid,
          fingerprint: credentials.oracleFingerprint,
          privateKey: credentials.oraclePrivateKey,
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

export const oracleProvider = new OracleProvider();
