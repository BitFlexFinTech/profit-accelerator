import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlertConfig {
  alert_type: string;
  is_enabled: boolean;
  threshold_value: number | null;
  cooldown_minutes: number;
}

interface TelegramConfig {
  bot_token: string | null;
  chat_id: string | null;
  notifications_enabled: boolean;
  notify_on_error: boolean;
}

async function sendTelegramAlert(
  botToken: string,
  chatId: string,
  message: string
): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    return response.ok;
  } catch (error) {
    console.error('[telegram-alert] Failed to send:', error);
    return false;
  }
}

async function checkAndSendAlerts(
  supabase: any,
  provider: string,
  status: string,
  cpuPercent: number,
  ramPercent: number,
  diskPercent: number,
  latencyMs: number
): Promise<void> {
  // Fetch alert configs
  const { data: alertConfigs } = await supabase
    .from('alert_config')
    .select('*')
    .eq('is_enabled', true);

  if (!alertConfigs || alertConfigs.length === 0) return;

  // Fetch Telegram config
  const { data: tgConfig } = await supabase
    .from('telegram_config')
    .select('*')
    .limit(1)
    .maybeSingle();

  const tg = tgConfig as TelegramConfig | null;
  if (!tg?.notifications_enabled || !tg?.bot_token || !tg?.chat_id) {
    return;
  }

  const alerts: string[] = [];

  for (const config of alertConfigs as AlertConfig[]) {
    const threshold = config.threshold_value;

    switch (config.alert_type) {
      case 'cpu_high':
        if (threshold && cpuPercent > threshold) {
          alerts.push(`🔥 <b>High CPU</b>: ${provider} at ${cpuPercent.toFixed(1)}% (threshold: ${threshold}%)`);
        }
        break;
      case 'ram_high':
        if (threshold && ramPercent > threshold) {
          alerts.push(`💾 <b>High RAM</b>: ${provider} at ${ramPercent.toFixed(1)}% (threshold: ${threshold}%)`);
        }
        break;
      case 'disk_high':
        if (threshold && diskPercent > threshold) {
          alerts.push(`💿 <b>High Disk</b>: ${provider} at ${diskPercent.toFixed(1)}% (threshold: ${threshold}%)`);
        }
        break;
      case 'instance_offline':
        if (status === 'offline' || status === 'timeout') {
          alerts.push(`🔴 <b>Instance Offline</b>: ${provider} is ${status}`);
        }
        break;
      case 'latency_high':
        if (threshold && latencyMs > threshold) {
          alerts.push(`⏱️ <b>High Latency</b>: ${provider} at ${latencyMs}ms (threshold: ${threshold}ms)`);
        }
        break;
    }
  }

  if (alerts.length === 0) return;

  // Check cooldown - don't send if we already sent an alert recently
  const { data: recentAlerts } = await supabase
    .from('alert_history')
    .select('sent_at')
    .gte('sent_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .limit(1);

  if (recentAlerts && recentAlerts.length > 0) {
    console.log('[scheduled-vps-health] Skipping alerts - cooldown active');
    return;
  }

  // Send combined alert
  const message = `🚨 <b>VPS Health Alert</b>\n\n${alerts.join('\n\n')}\n\n⏰ ${new Date().toISOString()}`;
  
  const sent = await sendTelegramAlert(tg.bot_token, tg.chat_id, message);

  // Log alert history
  for (const alertMsg of alerts) {
    await supabase.from('alert_history').insert({
      alert_type: alertMsg.includes('CPU') ? 'cpu_high' : 
                  alertMsg.includes('RAM') ? 'ram_high' :
                  alertMsg.includes('Disk') ? 'disk_high' :
                  alertMsg.includes('Offline') ? 'instance_offline' :
                  alertMsg.includes('Latency') ? 'latency_high' : 'unknown',
      channel: 'telegram',
      message: alertMsg.replace(/<[^>]*>/g, ''),
      severity: alertMsg.includes('Offline') ? 'error' : 'warning',
      sent_at: new Date().toISOString(),
    });
  }

  console.log(`[scheduled-vps-health] Sent ${alerts.length} alerts via Telegram:`, sent);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[scheduled-vps-health] Starting health check cycle...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all active VPS instances with IPs
    const { data: vpsInstances, error: vpsError } = await supabase
      .from('vps_config')
      .select('id, provider, region, outbound_ip, status, instance_type')
      .not('outbound_ip', 'is', null)
      .in('status', ['running', 'provisioning', 'healthy']);

    if (vpsError) {
      throw new Error(`Failed to fetch VPS instances: ${vpsError.message}`);
    }

    if (!vpsInstances?.length) {
      console.log('[scheduled-vps-health] No active VPS instances found');
      return new Response(
        JSON.stringify({ success: true, message: 'No active VPS instances', checked: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[scheduled-vps-health] Checking ${vpsInstances.length} VPS instances`);

    const results: { provider: string; status: string; latency: number; cpu?: number; memory?: number }[] = [];

    for (const vps of vpsInstances) {
      const provider = vps.provider || 'unknown';
      const ip = vps.outbound_ip;
      
      if (!ip || ip === 'Provisioning...' || ip === 'Manual Setup Required') {
        console.log(`[scheduled-vps-health] Skipping ${provider}: no valid IP (${ip})`);
        continue;
      }

      let healthStatus = 'offline';
      let latencyMs = 9999;
      let cpuPercent = 0;
      let ramPercent = 0;
      let diskPercent = 0;

      try {
        // Try to ping the health endpoint
        const healthUrl = `http://${ip}:8080/health`;
        console.log(`[scheduled-vps-health] Pinging ${provider} at ${healthUrl}`);
        
        const pingStart = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(healthUrl, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        
        clearTimeout(timeoutId);
        latencyMs = Date.now() - pingStart;

        if (response.ok) {
          healthStatus = 'healthy';
          
          try {
            const health = await response.json();
            // Normalize CPU: if array (load averages), convert to percentage
            if (typeof health.cpu_percent === 'number') {
              cpuPercent = health.cpu_percent;
            } else if (Array.isArray(health.cpu)) {
              cpuPercent = (health.cpu[0] ?? 0) * 100;
            } else if (typeof health.cpu === 'number') {
              cpuPercent = health.cpu;
            } else if (typeof health.cpuPercent === 'number') {
              cpuPercent = health.cpuPercent;
            }
            // Normalize RAM
            if (typeof health.ram_percent === 'number') {
              ramPercent = health.ram_percent;
            } else if (typeof health.memory?.percent === 'number') {
              ramPercent = health.memory.percent;
            } else if (typeof health.memory === 'number') {
              ramPercent = health.memory;
            } else if (typeof health.memoryPercent === 'number') {
              ramPercent = health.memoryPercent;
            } else if (typeof health.ram === 'number') {
              ramPercent = health.ram;
            }
            // Normalize disk
            if (typeof health.disk_percent === 'number') {
              diskPercent = health.disk_percent;
            } else if (typeof health.disk === 'number') {
              diskPercent = health.disk;
            } else if (typeof health.diskPercent === 'number') {
              diskPercent = health.diskPercent;
            }
          } catch {
            // Response wasn't JSON, but VPS is reachable
            healthStatus = 'healthy';
          }
        } else {
          healthStatus = 'warning';
        }
      } catch (fetchErr) {
        if (fetchErr instanceof Error) {
          if (fetchErr.name === 'AbortError') {
            console.log(`[scheduled-vps-health] ${provider} timed out`);
            healthStatus = 'timeout';
          } else {
            console.log(`[scheduled-vps-health] ${provider} unreachable: ${fetchErr.message}`);
            healthStatus = 'offline';
          }
        }
      }

      // Insert metrics into vps_metrics
      const { error: insertError } = await supabase.from('vps_metrics').insert({
        provider,
        cpu_percent: cpuPercent,
        ram_percent: ramPercent,
        disk_percent: diskPercent,
        latency_ms: latencyMs,
        recorded_at: new Date().toISOString()
      });

      if (insertError) {
        console.error(`[scheduled-vps-health] Failed to insert metrics for ${provider}:`, insertError.message);
      }

      // Update vps_config status if changed
      const newStatus = healthStatus === 'healthy' ? 'running' : 
                        healthStatus === 'warning' ? 'warning' : 
                        healthStatus === 'timeout' ? 'timeout' : 'offline';

      if (vps.status !== newStatus) {
        await supabase
          .from('vps_config')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', vps.id);

        // Log status change
        if (healthStatus === 'offline' || healthStatus === 'timeout') {
          await supabase.from('vps_timeline_events').insert({
            provider,
            event_type: 'health_check',
            event_subtype: 'status_change',
            title: `${provider} VPS ${healthStatus}`,
            description: `VPS at ${ip} is ${healthStatus}. Latency: ${latencyMs}ms`,
            metadata: { ip, latencyMs, previousStatus: vps.status, newStatus }
          });
        }
      }

      // Check and send alerts
      await checkAndSendAlerts(
        supabase,
        provider,
        healthStatus,
        cpuPercent,
        ramPercent,
        diskPercent,
        latencyMs
      );

      results.push({
        provider,
        status: healthStatus,
        latency: latencyMs,
        cpu: cpuPercent,
        memory: ramPercent
      });

      console.log(`[scheduled-vps-health] ${provider}: ${healthStatus} (${latencyMs}ms, CPU: ${cpuPercent}%, RAM: ${ramPercent}%)`);
    }

    const duration = Date.now() - startTime;
    console.log(`[scheduled-vps-health] Completed in ${duration}ms, checked ${results.length} instances`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        checked: results.length,
        duration,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[scheduled-vps-health] Error:', message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});