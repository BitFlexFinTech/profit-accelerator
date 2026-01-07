// Google Cloud Platform Provider Implementation

import { BaseVPSProvider } from './baseProvider';
import type { ProviderCredentials, ValidationResult, ProviderRegion, ProviderPricing } from './types';
import { supabase } from '@/integrations/supabase/client';

export class GCPProvider extends BaseVPSProvider {
  readonly name = 'gcp';
  readonly displayName = 'Google Cloud';

  readonly regions: ProviderRegion[] = [
    { id: 'us-central1', name: 'Iowa', country: 'US' },
    { id: 'us-east1', name: 'South Carolina', country: 'US' },
    { id: 'us-west1', name: 'Oregon', country: 'US' },
    { id: 'europe-west1', name: 'Belgium', country: 'BE' },
    { id: 'europe-west2', name: 'London', country: 'UK' },
    { id: 'europe-west3', name: 'Frankfurt', country: 'DE' },
    { id: 'asia-east1', name: 'Taiwan', country: 'TW', latencyEstimate: 12 },
    { id: 'asia-northeast1', name: 'Tokyo', country: 'JP', latencyEstimate: 5 },
    { id: 'asia-northeast2', name: 'Osaka', country: 'JP', latencyEstimate: 8 },
    { id: 'asia-southeast1', name: 'Singapore', country: 'SG', latencyEstimate: 15 },
    { id: 'australia-southeast1', name: 'Sydney', country: 'AU' },
  ];

  readonly pricing: Record<string, ProviderPricing> = {
    small: { hourly: 0, monthly: 0, name: 'e2-micro', isFree: true },
    medium: { hourly: 0.0335, monthly: 24.12, name: 'e2-medium', isFree: false },
    large: { hourly: 0.067, monthly: 48.24, name: 'e2-standard-2', isFree: false },
  };

  async validateCredentials(credentials: ProviderCredentials): Promise<ValidationResult> {
    if (!credentials.gcpServiceAccountJson || !credentials.gcpProjectId) {
      return { valid: false, message: 'GCP Service Account JSON and Project ID are required' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('gcp-cloud', {
        body: {
          action: 'validate-credentials',
          serviceAccountJson: credentials.gcpServiceAccountJson,
          projectId: credentials.gcpProjectId,
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

export const gcpProvider = new GCPProvider();
