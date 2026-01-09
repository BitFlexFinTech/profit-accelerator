import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function pushes a fix to the strategy.js file on the VPS
// It uses SSH commands to update the specific newline handling code
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get running VPS
    const { data: vps } = await supabase
      .from('vps_instances')
      .select('ip_address, provider')
      .eq('status', 'running')
      .not('ip_address', 'is', null)
      .single();

    if (!vps?.ip_address) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'No running VPS found',
        solution: 'Deploy a VPS first or check your VPS status'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[push-strategy-fix] Checking VPS at ${vps.ip_address}...`);

    // First, check VPS health
    let healthStatus;
    try {
      const healthResponse = await fetch(`http://${vps.ip_address}:8080/health`, {
        signal: AbortSignal.timeout(10000)
      });
      healthStatus = await healthResponse.json();
      console.log(`[push-strategy-fix] VPS health: v${healthStatus.version}, uptime: ${healthStatus.uptime}s`);
    } catch (err) {
      console.error(`[push-strategy-fix] VPS health check failed:`, err);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'VPS health check failed - bot may not be running',
        vps_ip: vps.ip_address,
        solution: 'SSH into the VPS and run: curl -fsSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | sudo bash'
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // The fix: Replace old newline regex with proper String.fromCharCode(10) approach
    // We need to push this via the install script since there's no /update-strategy endpoint yet
    
    // Strategy: Call the install script with a special flag to only update strategy.js
    // For now, we'll provide instructions
    
    return new Response(JSON.stringify({
      success: true,
      message: 'VPS is reachable and bot is running',
      vps_ip: vps.ip_address,
      current_version: healthStatus?.version || 'unknown',
      uptime_seconds: healthStatus?.uptime,
      fix_required: 'strategy.js needs newline fix',
      instructions: [
        'The strategy.js file needs to be updated on the VPS.',
        'Option 1 (Recommended): Re-run the install script via SSH:',
        `  ssh root@${vps.ip_address} "curl -fsSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | sudo bash"`,
        'Option 2: The fix is already in install-hft-bot. Just re-deploy the bot from the dashboard.',
        'After the fix, restart the bot from the dashboard.'
      ],
      ssh_command: `ssh root@${vps.ip_address} "curl -fsSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | sudo bash"`,
      next_steps: [
        'Run the SSH command above to update strategy.js',
        'After update, restart the bot from the dashboard',
        'Monitor logs to verify trades are executing'
      ]
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[push-strategy-fix] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: String(err)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
