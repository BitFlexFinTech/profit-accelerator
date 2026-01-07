// Microsoft Azure Provider Implementation

import { BaseVPSProvider } from './baseProvider';
import type { ProviderCredentials, ValidationResult, ProviderRegion, ProviderPricing } from './types';
import { supabase } from '@/integrations/supabase/client';

export class AzureProvider extends BaseVPSProvider {
  readonly name = 'azure';
  readonly displayName = 'Microsoft Azure';

  readonly regions: ProviderRegion[] = [
    { id: 'eastus', name: 'East US', country: 'US' },
    { id: 'westus', name: 'West US', country: 'US' },
    { id: 'centralus', name: 'Central US', country: 'US' },
    { id: 'westeurope', name: 'West Europe', country: 'NL' },
    { id: 'northeurope', name: 'North Europe', country: 'IE' },
    { id: 'uksouth', name: 'UK South', country: 'UK' },
    { id: 'germanywestcentral', name: 'Germany West Central', country: 'DE' },
    { id: 'japaneast', name: 'Japan East', country: 'JP', latencyEstimate: 5 },
    { id: 'japanwest', name: 'Japan West', country: 'JP', latencyEstimate: 8 },
    { id: 'southeastasia', name: 'Southeast Asia', country: 'SG', latencyEstimate: 15 },
    { id: 'australiaeast', name: 'Australia East', country: 'AU' },
    { id: 'koreacentral', name: 'Korea Central', country: 'KR', latencyEstimate: 10 },
  ];

  readonly pricing: Record<string, ProviderPricing> = {
    small: { hourly: 0, monthly: 0, name: 'B1s', isFree: true },
    medium: { hourly: 0.0416, monthly: 29.95, name: 'B2s', isFree: false },
    large: { hourly: 0.0832, monthly: 59.90, name: 'B4ms', isFree: false },
  };

  async validateCredentials(credentials: ProviderCredentials): Promise<ValidationResult> {
    if (!credentials.azureSubscriptionId || !credentials.azureTenantId || !credentials.azureClientId) {
      return { valid: false, message: 'Azure Subscription ID, Tenant ID, and Client ID are required' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('azure-cloud', {
        body: {
          action: 'validate-credentials',
          subscriptionId: credentials.azureSubscriptionId,
          tenantId: credentials.azureTenantId,
          clientId: credentials.azureClientId,
          clientSecret: credentials.azureClientSecret,
          resourceGroup: credentials.azureResourceGroup,
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

export const azureProvider = new AzureProvider();
