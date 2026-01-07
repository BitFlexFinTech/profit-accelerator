// Alibaba Cloud Provider Implementation

import { BaseVPSProvider } from './baseProvider';
import type { ProviderCredentials, ValidationResult, ProviderRegion, ProviderPricing } from './types';
import { supabase } from '@/integrations/supabase/client';

export class AlibabaProvider extends BaseVPSProvider {
  readonly name = 'alibaba';
  readonly displayName = 'Alibaba Cloud';

  readonly regions: ProviderRegion[] = [
    { id: 'cn-hangzhou', name: 'Hangzhou', country: 'CN' },
    { id: 'cn-shanghai', name: 'Shanghai', country: 'CN' },
    { id: 'cn-beijing', name: 'Beijing', country: 'CN' },
    { id: 'cn-shenzhen', name: 'Shenzhen', country: 'CN' },
    { id: 'cn-hongkong', name: 'Hong Kong', country: 'HK', latencyEstimate: 8 },
    { id: 'ap-southeast-1', name: 'Singapore', country: 'SG', latencyEstimate: 15 },
    { id: 'ap-northeast-1', name: 'Tokyo', country: 'JP', latencyEstimate: 5 },
    { id: 'ap-south-1', name: 'Mumbai', country: 'IN' },
    { id: 'eu-central-1', name: 'Frankfurt', country: 'DE' },
    { id: 'us-west-1', name: 'Silicon Valley', country: 'US' },
    { id: 'us-east-1', name: 'Virginia', country: 'US' },
    { id: 'eu-west-1', name: 'London', country: 'UK' },
  ];

  readonly pricing: Record<string, ProviderPricing> = {
    small: { hourly: 0.0044, monthly: 3.00, name: 'ecs.t5-lc1m1.small', isFree: false },
    medium: { hourly: 0.018, monthly: 13.00, name: 'ecs.t5-lc1m2.large', isFree: false },
    large: { hourly: 0.036, monthly: 26.00, name: 'ecs.t5-c1m2.xlarge', isFree: false },
  };

  async validateCredentials(credentials: ProviderCredentials): Promise<ValidationResult> {
    if (!credentials.alibabaAccessKeyId || !credentials.alibabaAccessKeySecret) {
      return { valid: false, message: 'Alibaba Access Key ID and Secret are required' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('alibaba-cloud', {
        body: {
          action: 'validate-credentials',
          accessKeyId: credentials.alibabaAccessKeyId,
          accessKeySecret: credentials.alibabaAccessKeySecret,
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

export const alibabaProvider = new AlibabaProvider();
