export type Provider = 'aws' | 'digitalocean' | 'vultr' | 'contabo' | 'oracle' | 'gcp' | 'alibaba' | 'azure';

export type CredentialStatus = 'pending' | 'validated' | 'error';

export interface CredentialField {
  id?: string;
  provider: Provider;
  fieldName: string;
  displayName: string;
  value: string;
  status: CredentialStatus;
  errorMessage?: string;
  lastValidatedAt?: string;
  isTextarea?: boolean;
}

export interface ProviderConfig {
  name: Provider;
  displayName: string;
  color: string;
  textColor: string;
  fields: Array<{
    fieldName: string;
    displayName: string;
    isTextarea?: boolean;
  }>;
}

export const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    name: 'aws',
    displayName: 'AWS',
    color: 'bg-orange-500',
    textColor: 'text-white',
    fields: [
      { fieldName: 'access_key_id', displayName: 'Access Key ID' },
      { fieldName: 'secret_access_key', displayName: 'Secret Access Key' },
    ],
  },
  {
    name: 'digitalocean',
    displayName: 'DigitalOcean',
    color: 'bg-cyan-500',
    textColor: 'text-white',
    fields: [
      { fieldName: 'personal_access_token', displayName: 'Personal Access Token' },
    ],
  },
  {
    name: 'vultr',
    displayName: 'Vultr',
    color: 'bg-fuchsia-500',
    textColor: 'text-white',
    fields: [
      { fieldName: 'api_key', displayName: 'API Key' },
    ],
  },
  {
    name: 'contabo',
    displayName: 'Contabo',
    color: 'bg-lime-500',
    textColor: 'text-black',
    fields: [
      { fieldName: 'client_id', displayName: 'Client ID' },
      { fieldName: 'client_secret', displayName: 'Client Secret' },
      { fieldName: 'api_password', displayName: 'API Password' },
    ],
  },
  {
    name: 'oracle',
    displayName: 'Oracle',
    color: 'bg-red-600',
    textColor: 'text-white',
    fields: [
      { fieldName: 'user_ocid', displayName: 'User OCID' },
      { fieldName: 'tenancy_ocid', displayName: 'Tenancy OCID' },
      { fieldName: 'api_private_key', displayName: 'API Private Key Content', isTextarea: true },
      { fieldName: 'fingerprint', displayName: 'Fingerprint' },
    ],
  },
  {
    name: 'gcp',
    displayName: 'GCP',
    color: 'bg-blue-500',
    textColor: 'text-white',
    fields: [
      { fieldName: 'service_account_json', displayName: 'Service Account JSON', isTextarea: true },
    ],
  },
  {
    name: 'alibaba',
    displayName: 'Alibaba',
    color: 'bg-yellow-500',
    textColor: 'text-black',
    fields: [
      { fieldName: 'accesskey_id', displayName: 'AccessKey ID' },
      { fieldName: 'accesskey_secret', displayName: 'AccessKey Secret' },
    ],
  },
  {
    name: 'azure',
    displayName: 'Azure',
    color: 'bg-sky-400',
    textColor: 'text-white',
    fields: [
      { fieldName: 'application_client_id', displayName: 'Application (Client) ID' },
      { fieldName: 'directory_tenant_id', displayName: 'Directory (Tenant) ID' },
      { fieldName: 'client_secret', displayName: 'Client Secret' },
      { fieldName: 'subscription_id', displayName: 'Subscription ID' },
    ],
  },
];

export interface DeploymentConfig {
  provider: Provider;
  region: string;
  size: 'small' | 'medium' | 'large' | 'custom';
  customSpecs?: {
    cpu: number;
    ram: number;
    storage: number;
  };
  repoUrl: string;
  branch: string;
  envVars: Record<string, string>;
  startCommand: string;
  allowedPorts?: number[];
  enableMonitoring: boolean;
  enableBackups: boolean;
}

export interface DeploymentStage {
  number: number;
  name: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  progress: number;
  message?: string;
  startedAt?: Date;
  completedAt?: Date;
  errorDetails?: string;
}

export const DEPLOYMENT_STAGES: Array<{ number: number; name: string; estimatedSeconds: number }> = [
  { number: 1, name: 'Reading credentials from database', estimatedSeconds: 2 },
  { number: 2, name: 'Validating API access with provider', estimatedSeconds: 3 },
  { number: 3, name: 'Generating SSH key pair', estimatedSeconds: 2 },
  { number: 4, name: 'Creating VPS instance via API', estimatedSeconds: 45 },
  { number: 5, name: 'Waiting for instance to boot', estimatedSeconds: 30 },
  { number: 6, name: 'Establishing SSH connection', estimatedSeconds: 10 },
  { number: 7, name: 'Updating system packages', estimatedSeconds: 30 },
  { number: 8, name: 'Configuring firewall rules', estimatedSeconds: 15 },
  { number: 9, name: 'Installing Node.js runtime', estimatedSeconds: 45 },
  { number: 10, name: 'Installing Git and build tools', estimatedSeconds: 30 },
  { number: 11, name: 'Cloning bot repository', estimatedSeconds: 15 },
  { number: 12, name: 'Installing bot dependencies', estimatedSeconds: 60 },
  { number: 13, name: 'Creating environment configuration', estimatedSeconds: 5 },
  { number: 14, name: 'Installing PM2 process manager', estimatedSeconds: 20 },
  { number: 15, name: 'Starting bot service', estimatedSeconds: 10 },
  { number: 16, name: 'Configuring PM2 startup script', estimatedSeconds: 10 },
  { number: 17, name: 'Running bot health checks', estimatedSeconds: 15 },
  { number: 18, name: 'Deployment complete', estimatedSeconds: 2 },
];

export interface VPSInstance {
  id: string;
  deploymentId: string;
  provider: Provider;
  providerInstanceId: string;
  nickname?: string;
  ipAddress: string;
  region: string;
  instanceSize: string;
  status: 'creating' | 'running' | 'stopped' | 'rebooting' | 'error' | 'deleted';
  botStatus: 'pending' | 'running' | 'standby' | 'stopped' | 'crashed' | 'error';
  botPid?: number;
  config?: DeploymentConfig;
  monthlyCost: number;
  createdAt: Date;
  updatedAt: Date;
  lastHealthCheck?: Date;
  uptimeSeconds: number;
}
