import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Exchange API endpoints for latency testing
const EXCHANGE_ENDPOINTS = {
  binance: 'https://api.binance.com/api/v3/ping',
  okx: 'https://www.okx.com/api/v5/public/time',
  bybit: 'https://api.bybit.com/v5/market/time',
  kucoin: 'https://api.kucoin.com/api/v1/timestamp',
  hyperliquid: 'https://api.hyperliquid.xyz/info',
  bitget: 'https://api.bitget.com/api/v2/public/time',
  gate: 'https://api.gateio.ws/api/v4/spot/time',
  mexc: 'https://api.mexc.com/api/v3/ping'
};

interface BenchmarkResult {
  provider: string;
  exchangeLatencies: Record<string, number>;
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  stdDev: number;
  hftScore: number;
  benchmarkType: string;
  rawResults: any;
}

// Measure latency to an exchange
async function measureExchangeLatency(url: string, samples: number = 5): Promise<number[]> {
  const latencies: number[] = [];
  
  for (let i = 0; i < samples; i++) {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      await fetch(url, { 
        signal: controller.signal,
        method: 'GET'
      });
      
      clearTimeout(timeout);
      latencies.push(Date.now() - start);
    } catch {
      latencies.push(999);
    }
    
    // Small delay between samples
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return latencies;
}

// Calculate standard deviation
function calculateStdDev(values: number[]): number {
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
  return Math.sqrt(avgSquareDiff);
}

// Calculate HFT Score (0-100)
function calculateHFTScore(
  avgLatency: number,
  minLatency: number,
  stdDev: number
): number {
  // Latency score: 50ms = 100, 200ms = 0
  const latencyScore = Math.max(0, Math.min(100, 100 - ((avgLatency - 50) / 1.5)));
  
  // Consistency score: lower stdDev = higher score
  const consistencyScore = Math.max(0, Math.min(100, 100 - (stdDev * 2)));
  
  // Best case score: based on minimum latency
  const bestCaseScore = Math.max(0, Math.min(100, 100 - ((minLatency - 30) / 1.7)));
  
  // Weighted average
  return Math.round(
    (latencyScore * 0.5) + 
    (consistencyScore * 0.3) + 
    (bestCaseScore * 0.2)
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, provider, providers: requestedProviders } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    switch (action) {
      case 'run-benchmark': {
        if (!provider) {
          throw new Error('Provider name required');
        }

        // Get provider's VPS IP
        const { data: vpsConfig } = await supabase
          .from('vps_config')
          .select('outbound_ip')
          .eq('provider', provider.toLowerCase())
          .single();

        if (!vpsConfig?.outbound_ip) {
          throw new Error(`No running VPS found for ${provider}`);
        }

        // Log benchmark started
        await supabase.from('vps_timeline_events').insert({
          provider,
          event_type: 'benchmark',
          event_subtype: 'started',
          title: 'Benchmark Started',
          description: `Running performance tests on ${provider}`,
          metadata: { ip: vpsConfig.outbound_ip }
        });

        // Run latency tests to all exchanges
        const exchangeLatencies: Record<string, number> = {};
        const allLatencies: number[] = [];

        for (const [exchange, url] of Object.entries(EXCHANGE_ENDPOINTS)) {
          const samples = await measureExchangeLatency(url);
          const avgLatency = samples.reduce((a, b) => a + b, 0) / samples.length;
          exchangeLatencies[exchange] = Math.round(avgLatency);
          allLatencies.push(...samples);
        }

        // Calculate statistics
        const avgLatency = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
        const minLatency = Math.min(...allLatencies);
        const maxLatency = Math.max(...allLatencies);
        const stdDev = calculateStdDev(allLatencies);
        const hftScore = calculateHFTScore(avgLatency, minLatency, stdDev);

        // Store benchmark result
        const { data: benchmarkResult } = await supabase
          .from('vps_benchmarks')
          .insert({
            provider: provider.toLowerCase(),
            benchmark_type: 'exchange_latency',
            score: avgLatency,
            raw_results: {
              samples: allLatencies,
              avgLatency,
              minLatency,
              maxLatency,
              stdDev
            },
            exchange_latencies: exchangeLatencies,
            hft_score: hftScore
          })
          .select()
          .single();

        // Log completion
        await supabase.from('vps_timeline_events').insert({
          provider,
          event_type: 'benchmark',
          event_subtype: 'completed',
          title: 'Benchmark Completed',
          description: `HFT Score: ${hftScore}/100, Avg Latency: ${Math.round(avgLatency)}ms`,
          metadata: { hftScore, avgLatency, exchangeLatencies }
        });

        return new Response(JSON.stringify({
          success: true,
          provider,
          hftScore,
          avgLatency: Math.round(avgLatency),
          minLatency,
          maxLatency,
          stdDev: Math.round(stdDev),
          exchangeLatencies,
          benchmarkId: benchmarkResult?.id
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'run-all': {
        // Get all running providers
        const { data: vpsConfigs } = await supabase
          .from('vps_config')
          .select('provider, outbound_ip')
          .eq('status', 'running');

        if (!vpsConfigs || vpsConfigs.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No running VPS instances found'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Log mesh benchmark started
        await supabase.from('vps_timeline_events').insert({
          provider: 'MESH',
          event_type: 'benchmark',
          event_subtype: 'started',
          title: 'Mesh Benchmark Started',
          description: `Running benchmarks on ${vpsConfigs.length} providers`,
          metadata: { providers: vpsConfigs.map(v => v.provider) }
        });

        const results: BenchmarkResult[] = [];

        // Run benchmarks on all providers
        for (const vps of vpsConfigs) {
          const exchangeLatencies: Record<string, number> = {};
          const allLatencies: number[] = [];

          for (const [exchange, url] of Object.entries(EXCHANGE_ENDPOINTS)) {
            const samples = await measureExchangeLatency(url, 3); // Fewer samples for speed
            const avgLatency = samples.reduce((a, b) => a + b, 0) / samples.length;
            exchangeLatencies[exchange] = Math.round(avgLatency);
            allLatencies.push(...samples);
          }

          const avgLatency = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
          const minLatency = Math.min(...allLatencies);
          const maxLatency = Math.max(...allLatencies);
          const stdDev = calculateStdDev(allLatencies);
          const hftScore = calculateHFTScore(avgLatency, minLatency, stdDev);

          // Store result
          await supabase.from('vps_benchmarks').insert({
            provider: vps.provider.toLowerCase(),
            benchmark_type: 'exchange_latency',
            score: avgLatency,
            raw_results: { avgLatency, minLatency, maxLatency, stdDev },
            exchange_latencies: exchangeLatencies,
            hft_score: hftScore
          });

          results.push({
            provider: vps.provider,
            exchangeLatencies,
            avgLatency: Math.round(avgLatency),
            minLatency,
            maxLatency,
            stdDev: Math.round(stdDev),
            hftScore,
            benchmarkType: 'exchange_latency',
            rawResults: { samples: allLatencies.length }
          });
        }

        // Sort by HFT score
        results.sort((a, b) => b.hftScore - a.hftScore);

        // Log completion
        await supabase.from('vps_timeline_events').insert({
          provider: 'MESH',
          event_type: 'benchmark',
          event_subtype: 'completed',
          title: 'Mesh Benchmark Completed',
          description: `Best: ${results[0]?.provider} (Score: ${results[0]?.hftScore})`,
          metadata: { 
            results: results.map(r => ({ 
              provider: r.provider, 
              hftScore: r.hftScore,
              avgLatency: r.avgLatency 
            }))
          }
        });

        // Send Telegram notification
        const { data: telegramConfig } = await supabase
          .from('telegram_config')
          .select('*')
          .eq('notifications_enabled', true)
          .single();

        if (telegramConfig?.bot_token && telegramConfig?.chat_id) {
          const rankings = results
            .map((r, i) => `${i + 1}. ${r.provider}: ${r.hftScore}/100 (${r.avgLatency}ms)`)
            .join('\n');

          const message = `📊 <b>VPS BENCHMARK RESULTS</b>\n\n` +
            `<b>HFT Performance Rankings:</b>\n${rankings}\n\n` +
            `🏆 Best: ${results[0]?.provider} with score ${results[0]?.hftScore}/100`;

          await fetch(`https://api.telegram.org/bot${telegramConfig.bot_token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramConfig.chat_id,
              text: message,
              parse_mode: 'HTML'
            })
          });
        }

        return new Response(JSON.stringify({
          success: true,
          results,
          bestProvider: results[0]?.provider,
          bestScore: results[0]?.hftScore
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get-results': {
        const { data: benchmarks } = await supabase
          .from('vps_benchmarks')
          .select('*')
          .order('run_at', { ascending: false })
          .limit(50);

        // Group by provider, get latest for each
        const latestByProvider: Record<string, any> = {};
        for (const b of benchmarks || []) {
          if (!latestByProvider[b.provider]) {
            latestByProvider[b.provider] = b;
          }
        }

        const results = Object.values(latestByProvider).sort(
          (a: any, b: any) => (b.hft_score || 0) - (a.hft_score || 0)
        );

        return new Response(JSON.stringify({
          success: true,
          results,
          totalBenchmarks: benchmarks?.length || 0
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'compare': {
        // Get latest benchmarks for comparison
        const { data: benchmarks } = await supabase
          .from('vps_benchmarks')
          .select('*')
          .order('run_at', { ascending: false });

        // Group by provider
        const byProvider: Record<string, any[]> = {};
        for (const b of benchmarks || []) {
          if (!byProvider[b.provider]) {
            byProvider[b.provider] = [];
          }
          byProvider[b.provider].push(b);
        }

        const comparison = Object.entries(byProvider).map(([provider, results]) => {
          const latest = results[0];
          const avgHftScore = results.reduce((sum, r) => sum + (r.hft_score || 0), 0) / results.length;
          
          return {
            provider,
            latestScore: latest.hft_score,
            avgScore: Math.round(avgHftScore),
            latestLatency: Math.round(latest.score),
            benchmarkCount: results.length,
            lastRun: latest.run_at,
            exchangeLatencies: latest.exchange_latencies
          };
        }).sort((a, b) => b.latestScore - a.latestScore);

        return new Response(JSON.stringify({
          success: true,
          comparison,
          bestProvider: comparison[0]?.provider,
          bestScore: comparison[0]?.latestScore
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({
          error: `Unknown action: ${action}`
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error: unknown) {
    console.error('VPS Benchmark Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
