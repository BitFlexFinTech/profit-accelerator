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

    // Parse request body for optional IP override
    let requestIp: string | null = null;
    try {
      const body = await req.json();
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
      const { data: vpsConfig, error: vpsError } = await supabase
        .from('vps_config')
        .select('id, outbound_ip, provider, status, region')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (!vpsError && vpsConfig?.outbound_ip) {
        targetIp = vpsConfig.outbound_ip;
        provider = vpsConfig.provider;
        vpsConfigId = vpsConfig.id;
        region = vpsConfig.region;
        console.log(`[check-vps-health] Using IP from vps_config: ${targetIp}`);
      } else {
        // Fallback to cloud_config
        console.log('[check-vps-health] No vps_config found, checking cloud_config...');
        
        const { data: cloudConfigs } = await supabase
          .from('cloud_config')
          .select('provider, credentials, region, status')
          .eq('is_active', true)
          .order('updated_at', { ascending: false });

        const activeCloud = cloudConfigs?.find((c: any) => c.credentials?.ip);
        
        if (activeCloud?.credentials?.ip) {
          targetIp = activeCloud.credentials.ip;
          provider = activeCloud.provider;
          region = activeCloud.region;
          console.log(`[check-vps-health] Found IP in cloud_config (${provider}): ${targetIp}`);
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

    const healthUrl = `http://${targetIp}/health`;
    console.log(`[check-vps-health] Checking health at: ${healthUrl}`);

    const startTime = Date.now();
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
        if (provider || requestIp) {
          // Normalize CPU: if array (load averages), convert to percentage; if number, use directly
          let cpuPercent = 0;
          if (typeof healthData.cpu_percent === 'number') {
            cpuPercent = healthData.cpu_percent;
          } else if (Array.isArray(healthData.cpu)) {
            cpuPercent = (healthData.cpu[0] ?? 0) * 100;
          } else if (typeof healthData.cpu === 'number') {
            cpuPercent = healthData.cpu;
          }

          // Normalize RAM
          let ramPercent = 0;
          if (typeof healthData.ram_percent === 'number') {
            ramPercent = healthData.ram_percent;
          } else if (typeof healthData.memory_percent === 'number') {
            ramPercent = healthData.memory_percent;
          } else if (typeof healthData.memory?.percent === 'number') {
            ramPercent = healthData.memory.percent;
          } else if (typeof healthData.memory === 'number') {
            ramPercent = healthData.memory;
          }

          // Normalize disk
          let diskPercent = 0;
          if (typeof healthData.disk_percent === 'number') {
            diskPercent = healthData.disk_percent;
          } else if (typeof healthData.disk === 'number') {
            diskPercent = healthData.disk;
          }

          // Normalize uptime
          let uptimeSeconds = 0;
          if (typeof healthData.uptime_seconds === 'number') {
            uptimeSeconds = healthData.uptime_seconds;
          } else if (typeof healthData.uptime === 'number') {
            uptimeSeconds = healthData.uptime;
          }

          const { error: metricsError } = await supabase.from('vps_metrics').upsert({
            provider: provider || 'vultr',
            cpu_percent: cpuPercent,
            ram_percent: ramPercent,
            disk_percent: diskPercent,
            latency_ms: latencyMs,
            network_in_mbps: 0,
            network_out_mbps: 0,
            uptime_seconds: uptimeSeconds,
            recorded_at: new Date().toISOString(),
          }, { onConflict: 'provider' });

          if (metricsError) {
            console.error('[check-vps-health] Failed to insert metrics:', metricsError);
          } else {
            console.log(`[check-vps-health] Inserted metrics: latency=${latencyMs}ms, cpu=${cpuPercent}%, ram=${ramPercent}%`);
          }
        }

        // Update VPS status to running - update by provider if we have one, or by ID
        if (vpsConfigId) {
          await supabase
            .from('vps_config')
            .update({ status: 'running', updated_at: new Date().toISOString() })
            .eq('id', vpsConfigId);
        } else if (provider) {
          // Update by provider when checking via request IP
          await supabase
            .from('vps_config')
            .update({ status: 'running', updated_at: new Date().toISOString() })
            .eq('provider', provider);
        }
        
        // Update HEALTH metrics and clear 'error' bot_status when VPS is healthy
        const now = new Date().toISOString();
        
        console.log(`[check-vps-health] Updating health metrics for IP=${targetIp}`);
        
        // Update vps_instances health status and clear 'error' bot_status
        await supabase
          .from('vps_instances')
          .update({ 
            last_health_check: now,
            health_status: isHealthy ? 'healthy' : 'unhealthy',
            status: isHealthy ? 'running' : 'offline',
            updated_at: now 
          })
          .eq('ip_address', targetIp);
        
        // Clear 'error' bot_status to 'stopped' when health is OK (don't set 'running' - user must start)
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
        
        // Update hft_deployments health status
        await supabase
          .from('hft_deployments')
          .update({ 
            status: isHealthy ? 'running' : 'offline',
            updated_at: now 
          })
          .eq('ip_address', targetIp);
        
        // Log to vps_proxy_health table
        await supabase.from('vps_proxy_health').insert({
          vps_ip: targetIp,
          is_healthy: isHealthy,
          latency_ms: latencyMs,
          consecutive_failures: 0
        });
        
        console.log(`[check-vps-health] VPS health updated, cleared error states if present`);
      }
    } catch (fetchError) {
      console.error('[check-vps-health] Fetch failed:', fetchError);
      const latencyMs = Date.now() - startTime;
      
      // Get current failure count from vps_proxy_health
      const { data: healthHistory } = await supabase
        .from('vps_proxy_health')
        .select('consecutive_failures')
        .eq('vps_ip', targetIp)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single();
      
      const currentFailures = (healthHistory?.consecutive_failures || 0) + 1;
      
      // Insert health record with incremented failure count
      await supabase.from('vps_proxy_health').insert({
        vps_ip: targetIp,
        is_healthy: false,
        latency_ms: latencyMs,
        consecutive_failures: currentFailures
      });
      
      // Create alert notification after 3 consecutive failures
      if (currentFailures >= 3) {
        await supabase.from('system_notifications').insert({
          type: 'vps_health',
          title: 'VPS Health Alert',
          message: `VPS ${targetIp} has failed ${currentFailures} consecutive health checks. Check your VPS status.`,
          severity: 'error',
          category: 'vps'
        });
        console.log(`[check-vps-health] Created alert notification for ${currentFailures} consecutive failures`);
      }
      
      // Set status to offline if we have an ID
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
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[check-vps-health] Error:', errMessage);
    return new Response(
      JSON.stringify({ success: false, error: errMessage, healthy: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});