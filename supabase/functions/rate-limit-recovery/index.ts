import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date();
    const recoveryLog: string[] = [];

    // Part 1: Clear expired cooldowns
    const { data: expiredCooldowns } = await supabase
      .from('ai_providers')
      .select('provider_name, cooldown_until')
      .not('cooldown_until', 'is', null)
      .lt('cooldown_until', now.toISOString());

    for (const provider of expiredCooldowns || []) {
      await supabase
        .from('ai_providers')
        .update({ 
          cooldown_until: null,
          error_count: 0 
        })
        .eq('provider_name', provider.provider_name);
      
      recoveryLog.push(`Cleared expired cooldown for ${provider.provider_name}`);
      console.log(`[rate-limit-recovery] Cleared cooldown: ${provider.provider_name}`);
    }

    // Part 2: Reset daily usage at midnight UTC
    const todayMidnightUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    
    const { data: needsReset } = await supabase
      .from('ai_providers')
      .select('provider_name, daily_usage, last_daily_reset_at')
      .or(`last_daily_reset_at.is.null,last_daily_reset_at.lt.${todayMidnightUTC.toISOString()}`);

    for (const provider of needsReset || []) {
      if (provider.daily_usage > 0) {
        await supabase
          .from('ai_providers')
          .update({ 
            daily_usage: 0,
            current_usage: 0,
            last_daily_reset_at: now.toISOString()
          })
          .eq('provider_name', provider.provider_name);
        
        recoveryLog.push(`Reset daily usage for ${provider.provider_name} (was ${provider.daily_usage})`);
        console.log(`[rate-limit-recovery] Reset daily: ${provider.provider_name}`);
      }
    }

    // Part 3: Reset minute-based usage for providers where reset was > 1 minute ago
    const oneMinuteAgo = new Date(now.getTime() - 60000);
    
    const { data: needsMinuteReset } = await supabase
      .from('ai_providers')
      .select('provider_name, current_usage, last_reset_at')
      .gt('current_usage', 0)
      .or(`last_reset_at.is.null,last_reset_at.lt.${oneMinuteAgo.toISOString()}`);

    for (const provider of needsMinuteReset || []) {
      await supabase
        .from('ai_providers')
        .update({ 
          current_usage: 0,
          last_reset_at: now.toISOString()
        })
        .eq('provider_name', provider.provider_name);
      
      recoveryLog.push(`Reset minute usage for ${provider.provider_name}`);
    }

    // Part 4: Get current provider status for response
    const { data: providers } = await supabase
      .from('ai_providers')
      .select('provider_name, is_enabled, daily_usage, rate_limit_rpd, cooldown_until, error_count')
      .eq('is_enabled', true);

    const providerStatus = (providers || []).map(p => ({
      name: p.provider_name,
      dailyUsage: p.daily_usage,
      dailyLimit: p.rate_limit_rpd,
      available: p.daily_usage < (p.rate_limit_rpd || 1000) * 0.95,
      inCooldown: p.cooldown_until && new Date(p.cooldown_until) > now,
      errors: p.error_count
    }));

    console.log(`[rate-limit-recovery] Complete. Recovered: ${recoveryLog.length} items`);

    return new Response(JSON.stringify({
      success: true,
      timestamp: now.toISOString(),
      recoveryActions: recoveryLog.length,
      details: recoveryLog,
      providerStatus
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[rate-limit-recovery] Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
