import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body for action and optional IP override
    let action = 'health';
    let requestIp: string | null = null;
    try {
      const body = await req.json();
      action = body.action || 'health';
      requestIp = body.ipAddress || body.ip || null;
      if (requestIp) {
        console.log('[check-vps-health] Using IP from request body:', requestIp);
      }
    } catch {
      // No body or invalid JSON - will use database lookup
    }

    let targetIp: string | null = requestIp;
    let provider: string | null = null;
    let vpsConfigId: string | null = null;
    let region: string | null = null;

    // If no IP provided in request, look up from database
    if (!targetIp) {
      // Try hft_deployments first (most likely to have running VPS)
      const { data: hftDeployment } = await supabase
        .from('hft_deployments')
        .select('ip_address, provider, region')
        .eq('status', 'running')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (hftDeployment?.ip_address) {
        targetIp = hftDeployment.ip_address;
        provider = hftDeployment.provider;
        region = hftDeployment.region;
        console.log(`[check-vps-health] Using IP from hft_deployments: ${targetIp}`);
      } else {
        // Try vps_instances
        const { data: vpsInstance } = await supabase
          .from('vps_instances')
          .select('ip_address, provider, region')
          .eq('status', 'running')
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();

        if (vpsInstance?.ip_address) {
          targetIp = vpsInstance.ip_address;
          provider = vpsInstance.provider;
          region = vpsInstance.region;
          console.log(`[check-vps-health] Using IP from vps_instances: ${targetIp}`);
        } else {
          // Fallback to vps_config
          const { data: vpsConfig } = await supabase
            .from('vps_config')
            .select('id, outbound_ip, provider, status, region')
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();

          if (vpsConfig?.outbound_ip) {
            targetIp = vpsConfig.outbound_ip;
            provider = vpsConfig.provider;
            vpsConfigId = vpsConfig.id;
            region = vpsConfig.region;
            console.log(`[check-vps-health] Using IP from vps_config: ${targetIp}`);
          }
        }
      }
    }

    if (!targetIp) {
      console.log('[check-vps-health] No VPS IP found');
      return new Response(
        JSON.stringify({ success: true, healthy: false, error: 'No VPS configured', ip: null, provider: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const startTime = Date.now();

    // Handle different actions
    if (action === 'ping-exchanges') {
      return await handlePingExchanges(targetIp, startTime, provider, supabase);
    }

    if (action === 'bot-status') {
      return await handleBotStatus(targetIp, startTime, provider);
    }

    if (action === 'positions') {
      return await handlePositions(targetIp, startTime, provider);
    }

    if (action === 'trades') {
      return await handleTrades(targetIp, startTime, provider);
    }

    if (action === 'balances') {
      return await handleBalances(targetIp, startTime, provider);
    }

    if (action === 'bot-start') {
      return await handleBotControl(targetIp, startTime, 'start');
    }

    if (action === 'bot-stop') {
      return await handleBotControl(targetIp, startTime, 'stop');
    }

    // Default: health check
    return await handleHealthCheck(targetIp, startTime, provider, vpsConfigId, supabase);

  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[check-vps-health] Error:', errMessage);
    return new Response(
      JSON.stringify({ success: false, error: errMessage, healthy: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function handleHealthCheck(
  targetIp: string,
  startTime: number,
  provider: string | null,
  vpsConfigId: string | null,
  supabase: any
) {
  const healthUrl = `http://${targetIp}/health`;
  console.log(`[check-vps-health] Checking health at: ${healthUrl}`);

  let healthData: any = null;
  let isHealthy = false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (response.ok) {
      healthData = await response.json();
      isHealthy = healthData.status === 'ok';
      console.log('[check-vps-health] Health response:', healthData);

      // Insert metrics if we have a provider
      if (provider) {
        // Normalize CPU, RAM, Disk
        let cpuPercent = healthData.cpu_percent ?? healthData.cpu ?? 0;
        let ramPercent = healthData.ram_percent ?? healthData.memory_percent ?? healthData.memory ?? 0;
        let diskPercent = healthData.disk_percent ?? healthData.disk ?? 0;
        let uptimeSeconds = healthData.uptime_seconds ?? healthData.uptime ?? 0;

        if (Array.isArray(cpuPercent)) {
          cpuPercent = (cpuPercent[0] ?? 0) * 100;
        }

        await supabase.from('vps_metrics').upsert({
          provider: provider,
          cpu_percent: cpuPercent,
          ram_percent: ramPercent,
          disk_percent: diskPercent,
          latency_ms: latencyMs,
          network_in_mbps: 0,
          network_out_mbps: 0,
          uptime_seconds: uptimeSeconds,
          recorded_at: new Date().toISOString(),
        }, { onConflict: 'provider' });
      }

      // Update VPS status
      const now = new Date().toISOString();
      
      if (vpsConfigId) {
        await supabase
          .from('vps_config')
          .update({ status: 'running', updated_at: now })
          .eq('id', vpsConfigId);
      }

      await supabase
        .from('vps_instances')
        .update({ 
          last_health_check: now,
          health_status: isHealthy ? 'healthy' : 'unhealthy',
          status: isHealthy ? 'running' : 'offline',
          updated_at: now 
        })
        .eq('ip_address', targetIp);

      // Clear error bot_status when healthy
      if (isHealthy) {
        await supabase
          .from('vps_instances')
          .update({ bot_status: 'stopped', updated_at: now })
          .eq('ip_address', targetIp)
          .eq('bot_status', 'error');

        await supabase
          .from('hft_deployments')
          .update({ bot_status: 'stopped', updated_at: now })
          .eq('ip_address', targetIp)
          .eq('bot_status', 'error');

        await supabase
          .from('trading_config')
          .update({ bot_status: 'stopped', updated_at: now })
          .eq('bot_status', 'error');
      }

      await supabase
        .from('hft_deployments')
        .update({ status: isHealthy ? 'running' : 'offline', updated_at: now })
        .eq('ip_address', targetIp);

      // Log to vps_proxy_health
      await supabase.from('vps_proxy_health').insert({
        vps_ip: targetIp,
        is_healthy: isHealthy,
        latency_ms: latencyMs,
        consecutive_failures: 0
      });
    }
  } catch (fetchError) {
    console.error('[check-vps-health] Fetch failed:', fetchError);
    const latencyMs = Date.now() - startTime;

    // Get current failure count
    const { data: healthHistory } = await supabase
      .from('vps_proxy_health')
      .select('consecutive_failures')
      .eq('vps_ip', targetIp)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single();

    const currentFailures = (healthHistory?.consecutive_failures || 0) + 1;

    await supabase.from('vps_proxy_health').insert({
      vps_ip: targetIp,
      is_healthy: false,
      latency_ms: latencyMs,
      consecutive_failures: currentFailures
    });

    if (currentFailures >= 3) {
      await supabase.from('system_notifications').insert({
        type: 'vps_health',
        title: 'VPS Health Alert',
        message: `VPS ${targetIp} has failed ${currentFailures} consecutive health checks.`,
        severity: 'error',
        category: 'vps'
      });
    }

    if (vpsConfigId) {
      await supabase
        .from('vps_config')
        .update({ status: 'offline', updated_at: new Date().toISOString() })
        .eq('id', vpsConfigId)
        .not('status', 'eq', 'deploying');
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      healthy: isHealthy,
      ip: targetIp,
      provider: provider,
      data: healthData,
      latency_ms: Date.now() - startTime,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handlePingExchanges(
  targetIp: string,
  startTime: number,
  provider: string | null,
  supabase: any
) {
  const pingUrl = `http://${targetIp}/ping-exchanges`;
  console.log(`[check-vps-health] Pinging exchanges at: ${pingUrl}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(pingUrl, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json();
      console.log('[check-vps-health] Ping response:', data);

      // Store exchange pulse data
      const pings = data.results || data.pings || [];
      for (const ping of pings) {
        await supabase.from('exchange_pulse').upsert({
          exchange_name: ping.exchange || ping.exchange_name,
          status: ping.success ? 'healthy' : 'error',
          latency_ms: ping.latencyMs || ping.latency_ms || 0,
          source: 'vps',
          region: provider,
          last_check: new Date().toISOString(),
          error_message: ping.error || null
        }, { onConflict: 'exchange_name' });
      }

      return new Response(
        JSON.stringify({
          success: true,
          pings: pings.map((p: any) => ({
            exchange: p.exchange || p.exchange_name,
            latencyMs: p.latencyMs || p.latency_ms || 0,
            success: p.success !== false,
            error: p.error
          })),
          latency_ms: latencyMs,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: `HTTP ${response.status}`,
          pings: [],
          latency_ms: latencyMs,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[check-vps-health] Ping failed:', errMessage);
    return new Response(
      JSON.stringify({
        success: false,
        error: errMessage,
        pings: [],
        latency_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function handleBotStatus(
  targetIp: string,
  startTime: number,
  provider: string | null
) {
  const statusUrl = `http://${targetIp}/bot/status`;
  console.log(`[check-vps-health] Checking bot status at: ${statusUrl}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(statusUrl, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json();
      console.log('[check-vps-health] Bot status response:', data);

      return new Response(
        JSON.stringify({
          success: true,
          running: data.running === true,
          uptime: data.uptime,
          lastTrade: data.lastTrade,
          data: data,
          latency_ms: latencyMs,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          running: false,
          error: `HTTP ${response.status}`,
          latency_ms: latencyMs,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[check-vps-health] Bot status failed:', errMessage);
    return new Response(
      JSON.stringify({
        success: false,
        running: false,
        error: errMessage,
        latency_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ===== NEW VPS DATA HANDLERS =====

async function handlePositions(
  targetIp: string,
  startTime: number,
  provider: string | null
) {
  const url = `http://${targetIp}/positions`;
  console.log(`[check-vps-health] Fetching positions at: ${url}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json();
      return new Response(
        JSON.stringify({
          success: true,
          positions: data.positions || data || [],
          latency_ms: latencyMs,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ success: false, positions: [], error: `HTTP ${response.status}`, latency_ms: latencyMs }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, positions: [], error: errMessage, latency_ms: Date.now() - startTime }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function handleTrades(
  targetIp: string,
  startTime: number,
  provider: string | null
) {
  const url = `http://${targetIp}/trades`;
  console.log(`[check-vps-health] Fetching trades at: ${url}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json();
      return new Response(
        JSON.stringify({
          success: true,
          trades: data.trades || data || [],
          latency_ms: latencyMs,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ success: false, trades: [], error: `HTTP ${response.status}`, latency_ms: latencyMs }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, trades: [], error: errMessage, latency_ms: Date.now() - startTime }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function handleBalances(
  targetIp: string,
  startTime: number,
  provider: string | null
) {
  const url = `http://${targetIp}/balances`;
  console.log(`[check-vps-health] Fetching balances at: ${url}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json();
      return new Response(
        JSON.stringify({
          success: true,
          balances: data.balances || data || [],
          totalUsd: data.totalUsd || data.total || 0,
          latency_ms: latencyMs,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ success: false, balances: [], totalUsd: 0, error: `HTTP ${response.status}`, latency_ms: latencyMs }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, balances: [], totalUsd: 0, error: errMessage, latency_ms: Date.now() - startTime }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function handleBotControl(
  targetIp: string,
  startTime: number,
  action: 'start' | 'stop'
) {
  const url = `http://${targetIp}/bot/${action}`;
  console.log(`[check-vps-health] Bot control (${action}) at: ${url}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, { method: 'POST', signal: controller.signal });
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json();
      return new Response(
        JSON.stringify({
          success: true,
          message: data.message || `Bot ${action} successful`,
          latency_ms: latencyMs,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ success: false, error: `HTTP ${response.status}`, latency_ms: latencyMs }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errMessage, latency_ms: Date.now() - startTime }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
