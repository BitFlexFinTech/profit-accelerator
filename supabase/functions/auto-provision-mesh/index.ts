import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { healthUrl, fetchWithTimeout } from "../_shared/vpsControl.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProviderResult {
  provider: string;
  success: boolean;
  publicIp?: string;
  latency?: number;
  error?: string;
  cost: number;
}

// Measure latency to a provider's health endpoint (uses port 80 via shared helper)
async function measureLatency(ip: string): Promise<number> {
  const start = Date.now();
  try {
    await fetchWithTimeout(healthUrl(ip), { method: 'GET' }, 5000);
    return Date.now() - start;
  } catch {
    return 999;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, providers: requestedProviders } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    switch (action) {
      case 'deploy-all': {
        // Get configured cloud providers with credentials
        const { data: cloudConfigs } = await supabase
          .from('cloud_config')
          .select('*')
          .eq('is_active', true);

        if (!cloudConfigs || cloudConfigs.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No cloud providers configured. Please configure at least one provider first.'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Log mesh deployment started
        await supabase.from('vps_timeline_events').insert({
          provider: 'MESH',
          event_type: 'deployment',
          event_subtype: 'started',
          title: 'Tokyo Mesh Deployment Started',
          description: `Deploying to ${cloudConfigs.length} providers simultaneously`,
          metadata: { providers: cloudConfigs.map(c => c.provider) }
        });

        const results: ProviderResult[] = [];
        const deployPromises: Promise<ProviderResult>[] = [];

        // Provider pricing
        const pricing: Record<string, number> = {
          contabo: 6.99,
          vultr: 5.00,
          aws: 8.35,
          digitalocean: 4.00,
          gcp: 0,
          oracle: 0,
          alibaba: 3.00,
          azure: 0
        };

        // Deploy to each configured provider in parallel
        for (const config of cloudConfigs) {
          const provider = config.provider.toLowerCase();
          const credentials = config.credentials as Record<string, any> || {};

          deployPromises.push((async (): Promise<ProviderResult> => {
            try {
              // Call the provider's edge function
              const { data, error } = await supabase.functions.invoke(`${provider}-cloud`, {
                body: {
                  action: 'deploy-instance',
                  ...credentials
                }
              });

              if (error) throw error;

              // Wait for instance to be ready (poll status)
              let publicIp: string | undefined;
              let attempts = 0;
              const maxAttempts = 30; // 5 minutes max

              while (!publicIp && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s
                
                const { data: statusData } = await supabase.functions.invoke(`${provider}-cloud`, {
                  body: {
                    action: 'get-instance-status',
                    instanceId: data?.instanceId || credentials?.instanceId,
                    vmName: data?.vmName || credentials?.vmName,
                    ...credentials
                  }
                });

                publicIp = statusData?.publicIp;
                attempts++;
              }

              if (!publicIp) {
                throw new Error('Timeout waiting for public IP');
              }

              // Measure latency using shared helper (port 80)
              const latency = await measureLatency(publicIp);

              return {
                provider,
                success: true,
                publicIp,
                latency,
                cost: pricing[provider] || 0
              };
            } catch (error: any) {
              console.error(`Failed to deploy to ${provider}:`, error);
              return {
                provider,
                success: false,
                error: error.message,
                cost: 0
              };
            }
          })());
        }

        // Wait for all deployments
        const deployResults = await Promise.allSettled(deployPromises);
        
        for (const result of deployResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          }
        }

        // Find lowest latency provider for primary
        const successfulProviders = results.filter(r => r.success && r.latency && r.latency < 500);
        successfulProviders.sort((a, b) => (a.latency || 999) - (b.latency || 999));

        let primaryProvider: ProviderResult | null = null;
        if (successfulProviders.length > 0) {
          primaryProvider = successfulProviders[0];

          // Set as primary in failover config
          await supabase.from('failover_config')
            .update({ is_primary: false })
            .neq('provider', 'placeholder');
          
          await supabase.from('failover_config')
            .update({ is_primary: true })
            .eq('provider', primaryProvider.provider);
        }

        // Calculate total cost
        const totalCost = results
          .filter(r => r.success)
          .reduce((sum, r) => sum + r.cost, 0);

        // Log completion
        await supabase.from('vps_timeline_events').insert({
          provider: 'MESH',
          event_type: 'deployment',
          event_subtype: 'completed',
          title: 'Tokyo Mesh Deployment Complete',
          description: `${successfulProviders.length}/${cloudConfigs.length} providers deployed successfully`,
          metadata: {
            results,
            primaryProvider: primaryProvider?.provider,
            primaryLatency: primaryProvider?.latency,
            totalCost
          }
        });

        // Send Telegram notification
        const { data: telegramConfig } = await supabase
          .from('telegram_config')
          .select('*')
          .eq('notifications_enabled', true)
          .single();

        if (telegramConfig?.bot_token && telegramConfig?.chat_id) {
          const successList = results
            .filter(r => r.success)
            .map(r => `• ${r.provider}: ${r.publicIp} (${r.latency}ms)${r.cost === 0 ? ' FREE' : ''}`)
            .join('\n');
          
          const failedList = results
            .filter(r => !r.success)
            .map(r => `• ${r.provider}: ${r.error}`)
            .join('\n');

          const message = `🚀 <b>TOKYO MESH DEPLOYED</b>\n\n` +
            `<b>Successful (${successfulProviders.length}):</b>\n${successList || 'None'}\n\n` +
            (failedList ? `<b>Failed:</b>\n${failedList}\n\n` : '') +
            `<b>Primary:</b> ${primaryProvider?.provider || 'None'} (${primaryProvider?.latency || '-'}ms)\n` +
            `<b>Total Cost:</b> $${totalCost.toFixed(2)}/mo`;

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
          deployed: results.filter(r => r.success).map(r => r.provider),
          failed: results.filter(r => !r.success).map(r => r.provider),
          results,
          primaryProvider: primaryProvider?.provider,
          primaryLatency: primaryProvider?.latency,
          totalCost
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'select-primary': {
        // Get all running providers and select best one as primary
        const { data: failoverConfigs } = await supabase
          .from('failover_config')
          .select('*')
          .eq('is_enabled', true)
          .order('latency_ms', { ascending: true });

        if (!failoverConfigs || failoverConfigs.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No running providers found'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Find lowest latency provider
        const bestProvider = failoverConfigs[0];

        // Update primary status
        await supabase.from('failover_config')
          .update({ is_primary: false })
          .neq('provider', bestProvider.provider);
        
        await supabase.from('failover_config')
          .update({ is_primary: true })
          .eq('provider', bestProvider.provider);

        await supabase.from('vps_timeline_events').insert({
          provider: bestProvider.provider,
          event_type: 'failover',
          event_subtype: 'primary_selected',
          title: 'Primary Provider Selected',
          description: `${bestProvider.provider} selected as primary (${bestProvider.latency_ms}ms)`,
          metadata: { latency: bestProvider.latency_ms }
        });

        return new Response(JSON.stringify({
          success: true,
          primaryProvider: bestProvider.provider,
          latency: bestProvider.latency_ms
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get-mesh-status': {
        const { data: failoverConfigs } = await supabase
          .from('failover_config')
          .select('*')
          .eq('is_enabled', true);

        const { data: vpsConfigs } = await supabase
          .from('vps_config')
          .select('*')
          .eq('status', 'running');

        const providers = (failoverConfigs || []).map(fc => ({
          provider: fc.provider,
          region: fc.region,
          latency: fc.latency_ms,
          isPrimary: fc.is_primary,
          consecutiveFailures: fc.consecutive_failures,
          status: vpsConfigs?.find(v => v.provider === fc.provider)?.status || 'unknown',
          ip: vpsConfigs?.find(v => v.provider === fc.provider)?.outbound_ip
        }));

        return new Response(JSON.stringify({
          success: true,
          providers,
          meshHealthy: providers.filter(p => p.consecutiveFailures < 3).length,
          totalProviders: providers.length
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
    console.error('Auto Provision Mesh Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
