// AWS EC2 Provider Implementation

import { BaseVPSProvider } from './baseProvider';
import type { ProviderCredentials, ValidationResult, ProviderRegion, ProviderPricing } from './types';
import { supabase } from '@/integrations/supabase/client';

export class AWSProvider extends BaseVPSProvider {
  readonly name = 'aws';
  readonly displayName = 'AWS';

  readonly regions: ProviderRegion[] = [
    { id: 'us-east-1', name: 'N. Virginia', country: 'US' },
    { id: 'us-west-2', name: 'Oregon', country: 'US' },
    { id: 'eu-west-1', name: 'Ireland', country: 'EU' },
    { id: 'ap-northeast-1', name: 'Tokyo', country: 'JP', latencyEstimate: 5 },
    { id: 'ap-southeast-1', name: 'Singapore', country: 'SG', latencyEstimate: 15 },
    { id: 'ap-south-1', name: 'Mumbai', country: 'IN' },
  ];

  readonly pricing: Record<string, ProviderPricing> = {
    small: { hourly: 0.0116, monthly: 8.35, name: 't3.micro', isFree: true },
    medium: { hourly: 0.0464, monthly: 33.41, name: 't3.medium', isFree: false },
    large: { hourly: 0.0928, monthly: 66.82, name: 't3.large', isFree: false },
  };

  async validateCredentials(credentials: ProviderCredentials): Promise<ValidationResult> {
    if (!credentials.awsAccessKeyId || !credentials.awsSecretAccessKey) {
      return { valid: false, message: 'AWS Access Key ID and Secret Access Key are required' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('aws-cloud', {
        body: {
          action: 'validate-credentials',
          accessKeyId: credentials.awsAccessKeyId,
          secretAccessKey: credentials.awsSecretAccessKey,
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

export const awsProvider = new AWSProvider();
