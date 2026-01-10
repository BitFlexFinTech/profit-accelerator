import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

// Provider pricing - REAL data
export const PROVIDER_PRICING: Record<string, { hourly: number; monthly: number; name: string; free: boolean; region: string }> = {
  contabo: { hourly: 0.0104, monthly: 6.99, name: 'Contabo', free: false, region: 'Singapore' },
  vultr: { hourly: 0.0074, monthly: 5.00, name: 'Vultr', free: false, region: 'Tokyo NRT' },
  aws: { hourly: 0.0116, monthly: 8.35, name: 'AWS', free: true, region: 'Tokyo ap-northeast-1' },
  digitalocean: { hourly: 0.0059, monthly: 4.00, name: 'DigitalOcean', free: false, region: 'Singapore SGP1' },
  gcp: { hourly: 0, monthly: 0, name: 'GCP', free: true, region: 'Tokyo asia-northeast1' },
  oracle: { hourly: 0, monthly: 0, name: 'Oracle', free: true, region: 'Tokyo ap-tokyo-1' },
  alibaba: { hourly: 0.0044, monthly: 3.00, name: 'Alibaba', free: false, region: 'Tokyo ap-northeast-1' },
  azure: { hourly: 0, monthly: 0, name: 'Azure', free: true, region: 'Japan East' },
};

export const PROVIDER_ICONS: Record<string, string> = {
  contabo: '🌏',
  vultr: '🦅',
  aws: '☁️',
  digitalocean: '🌊',
  gcp: '🔵',
  oracle: '🔴',
  alibaba: '🟠',
  azure: '💠',
};

export interface CloudProvider {
  id: string;
  provider: string;
  status: string;
  region: string;
  outbound_ip: string | null;
  latency_ms: number;
  is_primary: boolean;
  is_enabled: boolean;
  consecutive_failures: number;
  last_health_check: string | null;
  monthly_cost: number;
  is_free_tier: boolean;
}

export interface ProviderMetrics {
  provider: string;
  cpu_percent: number;
  ram_percent: number;
  disk_percent: number;
  latency_ms: number;
  uptime_seconds: number;
  recorded_at: string;
}

export interface LatencyDataPoint {
  provider: string;
  latency_ms: number;
  recorded_at: string;
}

export interface TimelineEvent {
  id: string;
  provider: string;
  event_type: string;
  event_subtype: string | null;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BenchmarkResult {
  id: string;
  provider: string;
  benchmark_type: string;
  score: number;
  raw_results: Record<string, unknown>;
  exchange_latencies: Record<string, number>;
  hft_score: number | null;
  run_at: string;
}

export interface CostOptimizationSuggestion {
  current_provider: string;
  recommended_provider: string;
  savings_monthly: number;
  latency_difference_ms: number;
  reason: string;
}

interface CloudInfrastructureState {
  providers: CloudProvider[];
  metrics: Record<string, ProviderMetrics>;
  latencyHistory: LatencyDataPoint[];
  timelineEvents: TimelineEvent[];
  benchmarkResults: Record<string, BenchmarkResult>;
  activeProvider: string | null;
  totalMonthlyCost: number;
  meshHealthScore: number;
  costOptimizationSuggestions: CostOptimizationSuggestion[];
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useCloudInfrastructure() {
  const [state, setState] = useState<CloudInfrastructureState>({
    providers: [],
    metrics: {},
    latencyHistory: [],
    timelineEvents: [],
    benchmarkResults: {},
    activeProvider: null,
    totalMonthlyCost: 0,
    meshHealthScore: 0,
    costOptimizationSuggestions: [],
    isConnected: false,
    isLoading: true,
    error: null,
  });

  // Fetch all cloud infrastructure data
  const fetchData = useCallback(async () => {
    try {
      // Fetch failover configs (source of truth for providers)
      const { data: failoverConfigs, error: fcError } = await supabase
        .from('failover_config')
        .select('*')
        .order('priority');

      if (fcError) throw fcError;

      // Fetch VPS configs for status and IPs
      const { data: vpsConfigs } = await supabase
        .from('vps_config')
        .select('*');

      // Fetch latest metrics for each provider
      const { data: allMetrics } = await supabase
        .from('vps_metrics')
        .select('*')
        .order('recorded_at', { ascending: false });

      // Fetch 24-hour latency history
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: latencyHistory } = await supabase
        .from('vps_metrics')
        .select('provider, latency_ms, recorded_at')
        .gte('recorded_at', twentyFourHoursAgo)
        .order('recorded_at', { ascending: true });

      // Fetch timeline events (last 50)
      const { data: timelineEvents } = await supabase
        .from('vps_timeline_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      // Fetch latest benchmarks for each provider
      const { data: benchmarks } = await supabase
        .from('vps_benchmarks')
        .select('*')
        .order('run_at', { ascending: false });

      // CRITICAL FIX: Fetch VPS→Exchange latency from exchange_pulse (HFT-relevant)
      // NOT from vps_metrics.latency_ms (which is Edge→VPS, irrelevant for HFT)
      const { data: vpsPulseData } = await supabase
        .from('exchange_pulse')
        .select('latency_ms')
        .eq('source', 'vps');
      
      // FALLBACK: If exchange_pulse has no VPS data, use vps_metrics.latency_ms
      let avgVpsExchangeLatency = 0;
      if (vpsPulseData && vpsPulseData.length > 0) {
        avgVpsExchangeLatency = Math.round(
          vpsPulseData.reduce((sum, p) => sum + (p.latency_ms || 0), 0) / vpsPulseData.length
        );
      } else if (allMetrics && allMetrics.length > 0) {
        // Fallback to vps_metrics latency if no exchange_pulse data
        const latencyMetrics = allMetrics.filter(m => m.latency_ms && m.latency_ms > 0);
        if (latencyMetrics.length > 0) {
          avgVpsExchangeLatency = Math.round(
            latencyMetrics.reduce((sum, m) => sum + (m.latency_ms || 0), 0) / latencyMetrics.length
          );
        }
      }

      // Build providers list from failover configs
      const providers: CloudProvider[] = (failoverConfigs || []).map(fc => {
        const vps = vpsConfigs?.find(v => v.provider === fc.provider);
        const pricing = PROVIDER_PRICING[fc.provider] || { monthly: 0, free: false, region: 'unknown' };
        const isDeployed = vps?.status === 'running';
        
        // Use VPS→Exchange latency for deployed VPS, otherwise show as "—" (null) not 0
        const actualLatency = isDeployed ? avgVpsExchangeLatency : 0;
        
        return {
          id: fc.id,
          provider: fc.provider,
          status: vps?.status || 'not_configured',
          region: fc.region || pricing.region || 'unknown',
          outbound_ip: vps?.outbound_ip || null,
          latency_ms: actualLatency,
          is_primary: fc.is_primary || false,
          is_enabled: fc.is_enabled ?? true,
          consecutive_failures: fc.consecutive_failures || 0,
          last_health_check: fc.last_health_check || null,
          monthly_cost: pricing.monthly,
          is_free_tier: pricing.free,
        };
      });

      // Build metrics map (latest per provider)
      const metricsMap: Record<string, ProviderMetrics> = {};
      if (allMetrics) {
        for (const metric of allMetrics) {
          if (!metricsMap[metric.provider]) {
            metricsMap[metric.provider] = {
              provider: metric.provider,
              cpu_percent: metric.cpu_percent || 0,
              ram_percent: metric.ram_percent || 0,
              disk_percent: metric.disk_percent || 0,
              latency_ms: metric.latency_ms || 0,
              uptime_seconds: metric.uptime_seconds || 0,
              recorded_at: metric.recorded_at || '',
            };
          }
        }
      }

      // Build benchmarks map (latest per provider)
      const benchmarksMap: Record<string, BenchmarkResult> = {};
      if (benchmarks) {
        for (const benchmark of benchmarks) {
          if (!benchmarksMap[benchmark.provider]) {
            benchmarksMap[benchmark.provider] = {
              id: benchmark.id,
              provider: benchmark.provider,
              benchmark_type: benchmark.benchmark_type,
              score: Number(benchmark.score) || 0,
              raw_results: (benchmark.raw_results as Record<string, unknown>) || {},
              exchange_latencies: (benchmark.exchange_latencies as Record<string, number>) || {},
              hft_score: benchmark.hft_score ? Number(benchmark.hft_score) : null,
              run_at: benchmark.run_at || '',
            };
          }
        }
      }

      // Find active provider
      const activeProvider = providers.find(p => p.is_primary)?.provider || null;

      // Calculate total monthly cost
      const totalMonthlyCost = providers
        .filter(p => p.status === 'running' || p.status === 'idle')
        .reduce((sum, p) => sum + p.monthly_cost, 0);

      // Calculate mesh health score (0-100)
      const enabledProviders = providers.filter(p => p.is_enabled);
      let meshHealthScore = 0;
      if (enabledProviders.length > 0) {
        let totalScore = 0;
        for (const p of enabledProviders) {
          let providerScore = 100;
          // Penalty for failures
          if (p.consecutive_failures >= 3) providerScore -= 50;
          else if (p.consecutive_failures >= 1) providerScore -= 20;
          // Penalty for high latency
          if (p.latency_ms > 150) providerScore -= 30;
          else if (p.latency_ms > 100) providerScore -= 15;
          // Penalty for non-running status
          if (p.status !== 'running' && p.status !== 'idle' && p.status !== 'not_configured') providerScore -= 40;
          // Bonus for running status
          if (p.status === 'running') providerScore += 10;
          totalScore += Math.max(0, Math.min(100, providerScore));
        }
        meshHealthScore = Math.round(totalScore / enabledProviders.length);
      }

      // Generate cost optimization suggestions
      const costOptimizationSuggestions: CostOptimizationSuggestion[] = [];
      const runningPaidProviders = providers.filter(p => 
        (p.status === 'running' || p.status === 'idle') && !p.is_free_tier
      );
      const healthyFreeProviders = providers.filter(p => 
        p.is_free_tier && (p.status === 'running' || p.status === 'idle' || p.status === 'not_configured')
      );

      for (const paid of runningPaidProviders) {
        for (const free of healthyFreeProviders) {
          const freeLatency = free.latency_ms || 50; // Assume 50ms if not measured
          const latencyDiff = freeLatency - paid.latency_ms;
          
          // Only suggest if latency difference is acceptable (<30ms)
          if (latencyDiff < 30) {
            costOptimizationSuggestions.push({
              current_provider: paid.provider,
              recommended_provider: free.provider,
              savings_monthly: paid.monthly_cost,
              latency_difference_ms: latencyDiff,
              reason: latencyDiff <= 0 
                ? `${free.provider} is FREE with same or better latency`
                : `${free.provider} is FREE, only ${latencyDiff}ms slower`,
            });
          }
        }
      }

      setState(prev => ({
        ...prev,
        providers,
        metrics: metricsMap,
        latencyHistory: latencyHistory || [],
        timelineEvents: (timelineEvents || []).map(e => ({
          ...e,
          metadata: (e.metadata as Record<string, unknown>) || {},
        })),
        benchmarkResults: benchmarksMap,
        activeProvider,
        totalMonthlyCost,
        meshHealthScore,
        costOptimizationSuggestions,
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      console.error('[useCloudInfrastructure] Error fetching data:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, []);

  // Set up real-time subscriptions
  useEffect(() => {
    fetchData();

    let channel: RealtimeChannel;

    const setupSubscriptions = () => {
      channel = supabase
        .channel('cloud-infrastructure-sync')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'failover_config'
        }, () => {
          console.log('[useCloudInfrastructure] Failover config changed');
          fetchData();
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'vps_config'
        }, () => {
          console.log('[useCloudInfrastructure] VPS config changed');
          fetchData();
        })
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'vps_metrics'
        }, (payload) => {
          console.log('[useCloudInfrastructure] New metrics received');
          const metric = payload.new as ProviderMetrics;
          setState(prev => ({
            ...prev,
            metrics: {
              ...prev.metrics,
              [metric.provider]: metric,
            },
            latencyHistory: [...prev.latencyHistory, {
              provider: metric.provider,
              latency_ms: metric.latency_ms,
              recorded_at: metric.recorded_at,
            }].slice(-500), // Keep last 500 data points
          }));
        })
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'vps_timeline_events'
        }, (payload) => {
          console.log('[useCloudInfrastructure] New timeline event');
          const event = payload.new as TimelineEvent;
          setState(prev => ({
            ...prev,
            timelineEvents: [
              { ...event, metadata: (event.metadata as Record<string, unknown>) || {} },
              ...prev.timelineEvents
            ].slice(0, 50),
          }));
        })
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'vps_benchmarks'
        }, (payload) => {
          console.log('[useCloudInfrastructure] New benchmark result');
          const benchmark = payload.new as BenchmarkResult;
          setState(prev => ({
            ...prev,
            benchmarkResults: {
              ...prev.benchmarkResults,
              [benchmark.provider]: {
                ...benchmark,
                score: Number(benchmark.score) || 0,
                raw_results: (benchmark.raw_results as Record<string, unknown>) || {},
                exchange_latencies: (benchmark.exchange_latencies as Record<string, number>) || {},
                hft_score: benchmark.hft_score ? Number(benchmark.hft_score) : null,
              },
            },
          }));
        })
        .subscribe((status) => {
          console.log('[useCloudInfrastructure] Subscription status:', status);
          setState(prev => ({ ...prev, isConnected: status === 'SUBSCRIBED' }));
        });
    };

    setupSubscriptions();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchData]);

  // Get best value recommendation (lowest latency per dollar)
  const bestValueProvider = useMemo(() => {
    const configuredProviders = state.providers.filter(
      p => p.status === 'running' || p.status === 'idle' || p.latency_ms > 0
    );

    if (configuredProviders.length === 0) {
      // Default recommendation if no providers configured
      return state.providers.find(p => p.provider === 'oracle') || 
             state.providers.find(p => p.provider === 'alibaba') ||
             state.providers[0];
    }

    // Calculate value score (lower is better): latency * cost
    // Free providers get cost = 0.5 for calculation purposes
    const withScores = configuredProviders.map(p => ({
      ...p,
      score: p.latency_ms * (p.monthly_cost || 0.5),
      latencyPerDollar: p.monthly_cost > 0 
        ? p.latency_ms / p.monthly_cost 
        : p.latency_ms,
    }));

    return withScores.sort((a, b) => a.score - b.score)[0];
  }, [state.providers]);

  // Refresh function
  const refresh = useCallback(() => {
    setState(prev => ({ ...prev, isLoading: true }));
    fetchData();
  }, [fetchData]);

  // Deploy to provider
  const deployProvider = useCallback(async (provider: string) => {
    const edgeFunction = `${provider}-cloud`;
    try {
      const { data, error } = await supabase.functions.invoke(edgeFunction, {
        body: { action: 'deploy' }
      });
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error(`[useCloudInfrastructure] Deploy ${provider} error:`, error);
      return { success: false, error };
    }
  }, []);

  // Switch primary provider
  const switchPrimary = useCallback(async (toProvider: string) => {
    try {
      const { error } = await supabase.functions.invoke('failover-monitor', {
        body: {
          action: 'manual-switch',
          from_provider: state.activeProvider,
          to_provider: toProvider,
        }
      });
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('[useCloudInfrastructure] Switch primary error:', error);
      return { success: false, error };
    }
  }, [state.activeProvider]);

  // Run benchmark on a provider
  const runBenchmark = useCallback(async (provider: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('vps-benchmark', {
        body: { provider }
      });
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error(`[useCloudInfrastructure] Benchmark ${provider} error:`, error);
      return { success: false, error };
    }
  }, []);

  // Run cost optimization
  const runCostOptimization = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('cost-optimizer', {
        body: { action: 'analyze' }
      });
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('[useCloudInfrastructure] Cost optimization error:', error);
      return { success: false, error };
    }
  }, []);

  // Deploy mesh (all providers)
  const deployMesh = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('auto-provision-mesh', {
        body: { action: 'deploy-all' }
      });
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('[useCloudInfrastructure] Deploy mesh error:', error);
      return { success: false, error };
    }
  }, []);

  return {
    ...state,
    bestValueProvider,
    refresh,
    deployProvider,
    switchPrimary,
    runBenchmark,
    runCostOptimization,
    deployMesh,
    PROVIDER_PRICING,
    PROVIDER_ICONS,
  };
}
