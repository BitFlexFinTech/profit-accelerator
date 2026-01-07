// VPS Provider Types - Unified interface for all cloud providers

export interface InstanceConfig {
  name: string;
  region: string;
  instanceType: 'small' | 'medium' | 'large' | 'custom';
  customSpecs?: {
    vcpus: number;
    ramGb: number;
    diskGb: number;
  };
  enableBackups?: boolean;
  enableMonitoring?: boolean;
  sshKey?: string;
  firewallRules?: FirewallRule[];
  botConfig?: BotDeploymentConfig;
}

export interface FirewallRule {
  port: number;
  protocol: 'tcp' | 'udp';
  source: string;
  description?: string;
}

export interface BotDeploymentConfig {
  repositoryUrl: string;
  branch: string;
  envVars: Record<string, string>;
  startCommand: string;
  autoStart: boolean;
}

export interface Instance {
  id: string;
  providerId: string;
  provider: string;
  name: string;
  region: string;
  ipAddress: string | null;
  specs: InstanceSpecs;
  status: InstanceStatus;
  botStatus: BotStatus;
  createdAt: Date;
  monthlyCost: number;
}

export interface InstanceSpecs {
  vcpus: number;
  ramGb: number;
  diskGb: number;
  bandwidth?: string;
}

export type InstanceStatus = 
  | 'provisioning'
  | 'running'
  | 'stopped'
  | 'error'
  | 'deleting'
  | 'offline'
  | 'timeout'
  | 'warning';

export type BotStatus = 
  | 'running'
  | 'stopped'
  | 'crashed'
  | 'starting'
  | 'unknown';

export interface InstanceMetrics {
  cpuPercent: number;
  ramPercent: number;
  diskPercent: number;
  networkInMbps: number;
  networkOutMbps: number;
  latencyMs: number;
  uptimeSeconds: number;
  timestamp: Date;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
}

export interface ProviderCredentials {
  // AWS
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  
  // DigitalOcean
  digitalOceanToken?: string;
  
  // Vultr
  vultrApiKey?: string;
  
  // Contabo
  contaboClientId?: string;
  contaboClientSecret?: string;
  contaboApiUser?: string;
  contaboApiPassword?: string;
  
  // Oracle
  oracleUserOcid?: string;
  oracleTenancyOcid?: string;
  oracleFingerprint?: string;
  oraclePrivateKey?: string;
  
  // GCP
  gcpServiceAccountJson?: string;
  gcpProjectId?: string;
  
  // Alibaba
  alibabaAccessKeyId?: string;
  alibabaAccessKeySecret?: string;
  
  // Azure
  azureSubscriptionId?: string;
  azureTenantId?: string;
  azureClientId?: string;
  azureClientSecret?: string;
  azureResourceGroup?: string;
}

export interface ProviderPricing {
  hourly: number;
  monthly: number;
  name: string;
  isFree: boolean;
}

export interface ProviderRegion {
  id: string;
  name: string;
  country: string;
  latencyEstimate?: number;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

export interface DeploymentProgress {
  step: DeploymentStep;
  status: 'pending' | 'running' | 'success' | 'error';
  message: string;
  timestamp: Date;
}

export type DeploymentStep = 
  | 'creating_instance'
  | 'configuring_server'
  | 'installing_dependencies'
  | 'deploying_bot'
  | 'starting_services'
  | 'running_health_checks'
  | 'complete';

// Provider interface - implemented by each cloud provider
export interface VPSProvider {
  readonly name: string;
  readonly displayName: string;
  readonly regions: ProviderRegion[];
  readonly pricing: Record<string, ProviderPricing>;
  
  validateCredentials(credentials: ProviderCredentials): Promise<ValidationResult>;
  createInstance(config: InstanceConfig): Promise<Instance>;
  deleteInstance(instanceId: string): Promise<void>;
  startInstance(instanceId: string): Promise<void>;
  stopInstance(instanceId: string): Promise<void>;
  restartInstance(instanceId: string): Promise<void>;
  getInstanceStatus(instanceId: string): Promise<InstanceStatus>;
  getInstanceMetrics(instanceId: string): Promise<InstanceMetrics>;
  executeCommand(instanceId: string, command: string): Promise<CommandResult>;
  getLogs(instanceId: string, lines?: number): Promise<string[]>;
}

// Provider configuration stored in database
export interface StoredProviderConfig {
  id: string;
  provider: string;
  region: string;
  instanceType: string | null;
  outboundIp: string | null;
  status: string | null;
  createdAt: string;
  updatedAt: string;
}
