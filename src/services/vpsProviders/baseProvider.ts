// Base VPS Provider - Common functionality for all cloud providers

import { supabase } from '@/integrations/supabase/client';
import type {
  VPSProvider,
  InstanceConfig,
  Instance,
  InstanceStatus,
  InstanceMetrics,
  CommandResult,
  ProviderCredentials,
  ValidationResult,
  ProviderRegion,
  ProviderPricing,
} from './types';

export abstract class BaseVPSProvider implements VPSProvider {
  abstract readonly name: string;
  abstract readonly displayName: string;
  abstract readonly regions: ProviderRegion[];
  abstract readonly pricing: Record<string, ProviderPricing>;

  // Retry configuration
  protected maxRetries = 3;
  protected retryDelayMs = 1000;

  // Abstract methods that each provider must implement
  abstract validateCredentials(credentials: ProviderCredentials): Promise<ValidationResult>;
  
  // Common implementation - calls edge function
  async createInstance(config: InstanceConfig): Promise<Instance> {
    return this.callEdgeFunction<Instance>('create-instance', config as unknown as Record<string, unknown>);
  }

  async deleteInstance(instanceId: string): Promise<void> {
    await this.callEdgeFunction<void>('delete-instance', { instanceId });
  }

  async startInstance(instanceId: string): Promise<void> {
    await this.callEdgeFunction<void>('start-instance', { instanceId });
  }

  async stopInstance(instanceId: string): Promise<void> {
    await this.callEdgeFunction<void>('stop-instance', { instanceId });
  }

  async restartInstance(instanceId: string): Promise<void> {
    await this.callEdgeFunction<void>('restart-instance', { instanceId });
  }

  async getInstanceStatus(instanceId: string): Promise<InstanceStatus> {
    const result = await this.callEdgeFunction<{ status: InstanceStatus }>('get-status', { instanceId });
    return result.status;
  }

  async getInstanceMetrics(instanceId: string): Promise<InstanceMetrics> {
    // Get latest metrics from database
    const { data, error } = await supabase
      .from('vps_metrics')
      .select('*')
      .eq('provider', this.name)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return this.getDefaultMetrics();
    }

    return {
      cpuPercent: data.cpu_percent || 0,
      ramPercent: data.ram_percent || 0,
      diskPercent: data.disk_percent || 0,
      networkInMbps: data.network_in_mbps || 0,
      networkOutMbps: data.network_out_mbps || 0,
      latencyMs: data.latency_ms || 0,
      uptimeSeconds: data.uptime_seconds || 0,
      timestamp: new Date(data.recorded_at || Date.now()),
    };
  }

  async executeCommand(instanceId: string, command: string): Promise<CommandResult> {
    return this.callEdgeFunction<CommandResult>('execute-command', { instanceId, command });
  }

  async getLogs(instanceId: string, lines: number = 100): Promise<string[]> {
    const result = await this.callEdgeFunction<{ logs?: string[] }>('get-logs', { instanceId, lines });
    return result.logs || [];
  }

  // Helper: Call provider-specific edge function with retry logic
  protected async callEdgeFunction<T>(action: string, payload: Record<string, unknown>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke(`${this.name}-cloud`, {
          body: { action, ...payload },
        });

        if (error) {
          throw new Error(error.message);
        }

        return data as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[${this.displayName}] Attempt ${attempt + 1} failed:`, lastError.message);

        if (attempt < this.maxRetries - 1) {
          // Exponential backoff
          await this.sleep(this.retryDelayMs * Math.pow(2, attempt));
        }
      }
    }

    throw lastError || new Error(`Failed after ${this.maxRetries} attempts`);
  }

  // Helper: Get default metrics when none available
  protected getDefaultMetrics(): InstanceMetrics {
    return {
      cpuPercent: 0,
      ramPercent: 0,
      diskPercent: 0,
      networkInMbps: 0,
      networkOutMbps: 0,
      latencyMs: 0,
      uptimeSeconds: 0,
      timestamp: new Date(),
    };
  }

  // Helper: Sleep for retry delays
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper: Get instance type specs
  protected getInstanceSpecs(instanceType: string): { vcpus: number; ramGb: number; diskGb: number } {
    const specs: Record<string, { vcpus: number; ramGb: number; diskGb: number }> = {
      small: { vcpus: 2, ramGb: 4, diskGb: 25 },
      medium: { vcpus: 4, ramGb: 8, diskGb: 50 },
      large: { vcpus: 8, ramGb: 16, diskGb: 100 },
    };
    return specs[instanceType] || specs.medium;
  }

  // Helper: Get monthly cost estimate
  getMonthlyCost(instanceType: string = 'medium'): number {
    return this.pricing[instanceType]?.monthly || 0;
  }
}
