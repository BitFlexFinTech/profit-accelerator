import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const body = await req.json();
    const action = body.action || 'health-check';

    console.log(`Failover monitor action: ${action}`);

    if (action === 'health-check') {
      // Fetch all enabled failover configs
      const { data: configs, error: configError } = await supabase
        .from('failover_config')
        .select('*')
        .eq('is_enabled', true)
        .order('priority');

      if (configError) throw configError;

      const results: HealthCheckResult[] = [];
      let primaryDown = false;
      let primaryProvider = '';

      for (const config of configs || []) {
        const result = await checkHealth(config);
        results.push(result);

        if (config.is_primary) {
          primaryProvider = config.provider;
          if (result.status === 'down') {
            primaryDown = true;
          }
        }

        // Log health check result
        await supabase.from('health_check_results').insert({
          check_type: 'failover',
          provider: config.provider,
          status: result.status,
          message: result.error || `Latency: ${result.latency}ms`,
          details: { latency: result.latency }
        });
      }

      // Auto-failover if primary is down
      if (primaryDown && configs && configs.length > 1) {
        const nextServer = configs.find(c => !c.is_primary && c.provider !== primaryProvider);
        
        if (nextServer) {
          console.log(`Primary ${primaryProvider} is down, failing over to ${nextServer.provider}`);
          
          // Update configs
          await supabase
            .from('failover_config')
            .update({ is_primary: false })
            .eq('provider', primaryProvider);
          
          await supabase
            .from('failover_config')
            .update({ is_primary: true })
            .eq('provider', nextServer.provider);

          // Log event
          await supabase.from('failover_events').insert({
            from_provider: primaryProvider,
            to_provider: nextServer.provider,
            reason: 'auto_health_check_failure',
            is_automatic: true
          });

          // Send Telegram notification if configured
          const { data: telegramConfig } = await supabase
            .from('telegram_config')
            .select('*')
            .eq('notifications_enabled', true)
            .single();

          if (telegramConfig?.bot_token && telegramConfig?.chat_id) {
            const message = `🚨 VPS FAILOVER ALERT\n\n` +
              `Primary server ${primaryProvider} is DOWN!\n` +
              `Auto-switched to ${nextServer.provider}\n\n` +
              `Time: ${new Date().toISOString()}`;

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
        }
      }

      return new Response(JSON.stringify({
        success: true,
        results,
        failoverTriggered: primaryDown,
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'manual-switch') {
      const { from_provider, to_provider } = body;

      if (!from_provider || !to_provider) {
        throw new Error('from_provider and to_provider are required');
      }

      // Update configs
      await supabase
        .from('failover_config')
        .update({ is_primary: false })
        .eq('provider', from_provider);
      
      await supabase
        .from('failover_config')
        .update({ is_primary: true })
        .eq('provider', to_provider);

      // Log event
      await supabase.from('failover_events').insert({
        from_provider,
        to_provider,
        reason: 'manual',
        is_automatic: false
      });

      return new Response(JSON.stringify({
        success: true,
        message: `Switched from ${from_provider} to ${to_provider}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      error: 'Unknown action',
      available_actions: ['health-check', 'manual-switch']
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Failover monitor error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function checkHealth(config: { provider: string; health_check_url: string | null; timeout_ms: number | null }): Promise<HealthCheckResult> {
  const timeout = config.timeout_ms || 5000;
  const url = config.health_check_url || `https://api.${config.provider}.com/v1/health`;

  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // For demo, simulate health check
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 10));
    
    clearTimeout(timeoutId);
    
    const latency = Date.now() - start;

    // Randomly simulate issues (5% chance)
    if (Math.random() < 0.05) {
      return {
        provider: config.provider,
        status: 'down',
        latency,
        error: 'Connection timeout'
      };
    }

    return {
      provider: config.provider,
      status: latency < 100 ? 'healthy' : latency < 300 ? 'warning' : 'down',
      latency
    };
  } catch (error) {
    return {
      provider: config.provider,
      status: 'down',
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
