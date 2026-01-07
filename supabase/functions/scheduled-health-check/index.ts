import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LATENCY_THRESHOLD_MS = 150;
const CONSECUTIVE_FAILURES_FOR_FAILOVER = 3; // 3 checks x 10s = 30s

interface FailoverConfig {
  id: string;
  provider: string;
  priority: number;
  is_primary: boolean;
  is_enabled: boolean;
  health_check_url: string | null;
  timeout_ms: number | null;
  region: string | null;
  latency_ms: number | null;
  consecutive_failures: number | null;
  auto_failover_enabled: boolean | null;
}

interface HealthCheckResult {
  provider: string;
  status: 'healthy' | 'warning' | 'down';
  latency: number;
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('[ScheduledHealthCheck] Starting health check cycle...');

    // Fetch all enabled failover configs with new columns
    const { data: configs, error: configError } = await supabase
      .from('failover_config')
      .select('*')
      .eq('is_enabled', true)
      .order('priority');

    if (configError) throw configError;

    const results: HealthCheckResult[] = [];
    let primaryConfig: FailoverConfig | null = null;
    let shouldFailover = false;
    let nextHealthyProvider: string | null = null;
    let nextHealthyLatency: number = 0;

    for (const config of (configs as FailoverConfig[]) || []) {
      const result = await performHealthCheck(config);
      results.push(result);

      // Calculate new consecutive failures
      let newConsecutiveFailures = config.consecutive_failures || 0;
      
      if (result.status === 'down' || result.latency > LATENCY_THRESHOLD_MS) {
        newConsecutiveFailures++;
        console.log(`[ScheduledHealthCheck] ${config.provider} failure count: ${newConsecutiveFailures}`);
      } else {
        newConsecutiveFailures = 0;
      }

      // Update failover_config with latest latency and failures
      await supabase
        .from('failover_config')
        .update({
          latency_ms: result.latency,
          consecutive_failures: newConsecutiveFailures,
          last_health_check: new Date().toISOString(),
        })
        .eq('id', config.id);

      // Track primary and check for failover
      if (config.is_primary) {
        primaryConfig = config;
        if (newConsecutiveFailures >= CONSECUTIVE_FAILURES_FOR_FAILOVER && config.auto_failover_enabled) {
          shouldFailover = true;
          console.log(`[ScheduledHealthCheck] Primary ${config.provider} exceeded failover threshold!`);
          
          // Send warning notification when primary is failing
          await sendTelegramMessage(supabase, 
            `🔴 <b>HEALTH CHECK FAILED</b>\n\n` +
            `Provider: <b>${config.provider}</b>\n` +
            `Consecutive Failures: ${newConsecutiveFailures}/${CONSECUTIVE_FAILURES_FOR_FAILOVER}\n` +
            `Last Error: ${result.error || 'Latency exceeded threshold'}\n` +
            `Latency: ${result.latency}ms (threshold: ${LATENCY_THRESHOLD_MS}ms)\n\n` +
            `⚠️ Auto-failover will be triggered!`
          );
        }
      } else if (!nextHealthyProvider && result.status === 'healthy') {
        nextHealthyProvider = config.provider;
        nextHealthyLatency = result.latency;
      }

      // Store health check result
      await supabase.from('health_check_results').insert({
        check_type: 'scheduled',
        provider: config.provider,
        status: result.status,
        message: result.error || `Latency: ${result.latency}ms`,
        details: { latency: result.latency, consecutive_failures: newConsecutiveFailures }
      });

      // Update vps_metrics with latency data
      await supabase.from('vps_metrics').insert({
        provider: config.provider,
        latency_ms: result.latency,
        recorded_at: new Date().toISOString(),
      });

      // Log to vps_timeline_events
      await supabase.from('vps_timeline_events').insert({
        provider: config.provider,
        event_type: result.status === 'healthy' ? 'health_check' : 
                    result.status === 'warning' ? 'health_warning' : 'health_failure',
        event_subtype: result.status,
        title: result.status === 'healthy' ? 'Health Check Passed' : 
               result.status === 'warning' ? 'Health Check Warning' : 'Health Check Failed',
        description: `Latency: ${result.latency}ms${result.error ? ` - ${result.error}` : ''}`,
        metadata: { 
          latency: result.latency, 
          consecutive_failures: newConsecutiveFailures,
          threshold_ms: LATENCY_THRESHOLD_MS,
          is_primary: config.is_primary,
          status: result.status
        }
      });
    }

    // Execute auto-failover if needed
    if (shouldFailover && primaryConfig && nextHealthyProvider) {
      console.log(`[ScheduledHealthCheck] Triggering failover: ${primaryConfig.provider} → ${nextHealthyProvider}`);

      // Update failover configs
      await supabase
        .from('failover_config')
        .update({ is_primary: false })
        .eq('provider', primaryConfig.provider);

      await supabase
        .from('failover_config')
        .update({ is_primary: true })
        .eq('provider', nextHealthyProvider);

      // Reset consecutive failures on the new primary
      await supabase
        .from('failover_config')
        .update({ consecutive_failures: 0 })
        .eq('provider', nextHealthyProvider);

      // Log failover event
      await supabase.from('failover_events').insert({
        from_provider: primaryConfig.provider,
        to_provider: nextHealthyProvider,
        reason: 'latency_threshold_exceeded',
        is_automatic: true,
      });

      // Log to timeline
      await supabase.from('vps_timeline_events').insert({
        provider: nextHealthyProvider,
        event_type: 'failover',
        event_subtype: 'automatic',
        title: `Failover: ${primaryConfig.provider} → ${nextHealthyProvider}`,
        description: `Primary server exceeded latency threshold of ${LATENCY_THRESHOLD_MS}ms for ${CONSECUTIVE_FAILURES_FOR_FAILOVER * 10}s`,
        metadata: {
          from_provider: primaryConfig.provider,
          to_provider: nextHealthyProvider,
          from_latency: primaryConfig.latency_ms,
          to_latency: nextHealthyLatency,
          reason: 'latency_threshold_exceeded',
          consecutive_failures: CONSECUTIVE_FAILURES_FOR_FAILOVER
        }
      });

      // Check if new primary is a free tier provider
      const freeProviders = ['oracle', 'gcp', 'azure'];
      const isFreeProvider = freeProviders.includes(nextHealthyProvider.toLowerCase());

      // Send enhanced Telegram failover notification
      const failoverMessage = `⚡ <b>FAILOVER TRIGGERED</b>\n\n` +
        `From: <b>${primaryConfig.provider}</b> (${primaryConfig.latency_ms || '?'}ms ⚠️)\n` +
        `To: <b>${nextHealthyProvider}</b> (${nextHealthyLatency}ms ✅)\n\n` +
        `📊 Reason: Exceeded ${LATENCY_THRESHOLD_MS}ms for ${CONSECUTIVE_FAILURES_FOR_FAILOVER * 10}s\n` +
        `⏱️ Time: ${new Date().toLocaleString()}\n\n` +
        (isFreeProvider ? `💰 <b>Bonus:</b> New primary is FREE tier!\n` : '') +
        `🔄 Auto-failover completed successfully.`;
      
      await sendTelegramMessage(supabase, failoverMessage);
    }

    return new Response(JSON.stringify({
      success: true,
      results,
      failoverTriggered: shouldFailover,
      newPrimary: shouldFailover ? nextHealthyProvider : null,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[ScheduledHealthCheck] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function performHealthCheck(config: FailoverConfig): Promise<HealthCheckResult> {
  const timeout = config.timeout_ms || 10000;

  // Check if we have a VPS IP to ping
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Try to get VPS IP from vps_config
  const { data: vpsConfig } = await supabase
    .from('vps_config')
    .select('outbound_ip, status')
    .eq('provider', config.provider)
    .single();

  const healthUrl = config.health_check_url || 
    (vpsConfig?.outbound_ip ? `http://${vpsConfig.outbound_ip}:8080/health` : null);

  if (!healthUrl) {
    console.log(`[ScheduledHealthCheck] No health URL for ${config.provider}, marking as healthy (not configured)`);
    return {
      provider: config.provider,
      status: 'healthy',
      latency: 0,
    };
  }

  const start = Date.now();
  console.log(`[ScheduledHealthCheck] Checking ${config.provider} at ${healthUrl}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - start;

    if (!response.ok) {
      return {
        provider: config.provider,
        status: 'down',
        latency,
        error: `HTTP ${response.status}`
      };
    }

    const data = await response.json();
    const isHealthy = data.status === 'ok' || data.status === 'healthy';

    return {
      provider: config.provider,
      status: isHealthy ? (latency < 100 ? 'healthy' : latency < LATENCY_THRESHOLD_MS ? 'warning' : 'down') : 'down',
      latency
    };
  } catch (error) {
    const latency = Date.now() - start;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ScheduledHealthCheck] ${config.provider} failed:`, errorMessage);

    return {
      provider: config.provider,
      status: 'down',
      latency,
      error: errorMessage.includes('abort') ? 'Connection timeout' : errorMessage
    };
  }
}

async function sendTelegramMessage(supabase: any, message: string) {
  try {
    const { data: telegramConfig } = await supabase
      .from('telegram_config')
      .select('*')
      .eq('notifications_enabled', true)
      .single();

    if (telegramConfig?.bot_token && telegramConfig?.chat_id) {
      await fetch(`https://api.telegram.org/bot${telegramConfig.bot_token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramConfig.chat_id,
          text: message,
          parse_mode: 'HTML'
        })
      });

      console.log('[ScheduledHealthCheck] Telegram notification sent');
    }
  } catch (error) {
    console.error('[ScheduledHealthCheck] Failed to send Telegram notification:', error);
  }
}
