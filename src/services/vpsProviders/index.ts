// VPS Providers - Unified exports

export * from './types';
export { BaseVPSProvider } from './baseProvider';

// Individual providers
export { awsProvider, AWSProvider } from './awsProvider';
export { digitalOceanProvider, DigitalOceanProvider } from './digitalOceanProvider';
export { vultrProvider, VultrProvider } from './vultrProvider';
export { contaboProvider, ContaboProvider } from './contaboProvider';
export { oracleProvider, OracleProvider } from './oracleProvider';
export { gcpProvider, GCPProvider } from './gcpProvider';
export { alibabaProvider, AlibabaProvider } from './alibabaProvider';
export { azureProvider, AzureProvider } from './azureProvider';

import { awsProvider } from './awsProvider';
import { digitalOceanProvider } from './digitalOceanProvider';
import { vultrProvider } from './vultrProvider';
import { contaboProvider } from './contaboProvider';
import { oracleProvider } from './oracleProvider';
import { gcpProvider } from './gcpProvider';
import { alibabaProvider } from './alibabaProvider';
import { azureProvider } from './azureProvider';
import type { VPSProvider } from './types';

// Provider registry - access any provider by name
export const providers: Record<string, VPSProvider> = {
  aws: awsProvider,
  digitalocean: digitalOceanProvider,
  vultr: vultrProvider,
  contabo: contaboProvider,
  oracle: oracleProvider,
  gcp: gcpProvider,
  alibaba: alibabaProvider,
  azure: azureProvider,
};

// Helper to get provider by name
export function getProvider(name: string): VPSProvider | undefined {
  return providers[name.toLowerCase()];
}

// Get all provider names
export function getAllProviderNames(): string[] {
  return Object.keys(providers);
}

// Get providers with free tiers
export function getFreeTierProviders(): VPSProvider[] {
  return Object.values(providers).filter(p => 
    Object.values(p.pricing).some(tier => tier.isFree)
  );
}

// Get provider pricing summary
export function getProviderPricingSummary(): { provider: string; minMonthly: number; maxMonthly: number; hasFree: boolean }[] {
  return Object.values(providers).map(p => {
    const prices = Object.values(p.pricing);
    return {
      provider: p.displayName,
      minMonthly: Math.min(...prices.map(pr => pr.monthly)),
      maxMonthly: Math.max(...prices.map(pr => pr.monthly)),
      hasFree: prices.some(pr => pr.isFree),
    };
  });
}
