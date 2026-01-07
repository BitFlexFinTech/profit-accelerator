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
        }
      } else if (!nextHealthyProvider && result.status === 'healthy') {
        nextHealthyProvider = config.provider;
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

      // Send Telegram notification
      await sendTelegramAlert(supabase, primaryConfig.provider, nextHealthyProvider);
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

async function sendTelegramAlert(supabase: any, fromProvider: string, toProvider: string) {
  try {
    const { data: telegramConfig } = await supabase
      .from('telegram_config')
      .select('*')
      .eq('notifications_enabled', true)
      .single();

    if (telegramConfig?.bot_token && telegramConfig?.chat_id) {
      const message = `🚨 <b>VPS AUTO-FAILOVER</b> 🚨\n\n` +
        `Primary server <b>${fromProvider}</b> exceeded latency threshold!\n\n` +
        `✅ Auto-switched to: <b>${toProvider}</b>\n\n` +
        `⏱️ Time: ${new Date().toISOString()}\n` +
        `📊 Threshold: ${LATENCY_THRESHOLD_MS}ms for ${CONSECUTIVE_FAILURES_FOR_FAILOVER * 10}s`;

      await fetch(`https://api.telegram.org/bot${telegramConfig.bot_token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramConfig.chat_id,
          text: message,
          parse_mode: 'HTML'
        })
      });

      console.log('[ScheduledHealthCheck] Telegram failover alert sent');
    }
  } catch (error) {
    console.error('[ScheduledHealthCheck] Failed to send Telegram alert:', error);
  }
}
