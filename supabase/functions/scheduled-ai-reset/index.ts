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
    console.log(`[scheduled-ai-reset] Running daily reset at ${now.toISOString()}`);

    // Fetch all enabled providers
    const { data: providers, error: fetchError } = await supabase
      .from('ai_providers')
      .select('provider_name, daily_usage, rate_limit_rpd, error_count')
      .eq('is_enabled', true);

    if (fetchError) {
      throw new Error(`Failed to fetch providers: ${fetchError.message}`);
    }

    const resetResults: string[] = [];

    for (const provider of providers || []) {
      const { error: updateError } = await supabase
        .from('ai_providers')
        .update({
          daily_usage: 0,
          current_usage: 0,
          error_count: 0,
          cooldown_until: null,
          last_daily_reset_at: now.toISOString(),
          last_reset_at: now.toISOString()
        })
        .eq('provider_name', provider.provider_name);

      if (!updateError) {
        resetResults.push(`${provider.provider_name}: reset from ${provider.daily_usage}/${provider.rate_limit_rpd} (errors: ${provider.error_count})`);
        console.log(`[scheduled-ai-reset] Reset ${provider.provider_name}`);
      } else {
        console.error(`[scheduled-ai-reset] Failed to reset ${provider.provider_name}:`, updateError);
      }
    }

    // Log the reset event as system notification
    await supabase.from('system_notifications').insert({
      type: 'ai_reset',
      title: 'Daily AI Provider Reset',
      message: `Reset ${resetResults.length} providers at midnight UTC`,
      severity: 'info',
      category: 'system'
    });

    return new Response(JSON.stringify({
      success: true,
      timestamp: now.toISOString(),
      providersReset: resetResults.length,
      details: resetResults
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[scheduled-ai-reset] Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
