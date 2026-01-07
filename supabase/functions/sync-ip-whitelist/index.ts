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

    const { vps_ip } = await req.json();

    if (!vps_ip) {
      return new Response(
        JSON.stringify({ success: false, error: 'VPS IP is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`[sync-ip-whitelist] Syncing IP ${vps_ip} to connected exchanges...`);

    // Get all connected exchanges
    const { data: exchanges, error: exchangeError } = await supabase
      .from('exchange_connections')
      .select('id, exchange_name, is_connected')
      .eq('is_connected', true);

    if (exchangeError) {
      console.error('[sync-ip-whitelist] Failed to fetch exchanges:', exchangeError);
      throw exchangeError;
    }

    const results: { exchange: string; status: string; whitelistUrl?: string }[] = [];

    // Exchange-specific whitelist URLs for manual configuration
    const whitelistUrls: Record<string, string> = {
      binance: 'https://www.binance.com/en/my/settings/api-management',
      bybit: 'https://www.bybit.com/user/api-management',
      okx: 'https://www.okx.com/account/my-api',
      kucoin: 'https://www.kucoin.com/account/api',
      gate: 'https://www.gate.io/myaccount/apiv4keys',
      mexc: 'https://www.mexc.com/user/openapi',
      bitget: 'https://www.bitget.com/en/account/newapi',
      hyperliquid: 'https://app.hyperliquid.xyz/account',
    };

    for (const exchange of exchanges || []) {
      console.log(`[sync-ip-whitelist] Processing ${exchange.exchange_name}...`);

      // Update or create credential_permissions record
      const { error: permError } = await supabase
        .from('credential_permissions')
        .upsert({
          provider: exchange.exchange_name,
          credential_type: 'api_key',
          ip_restricted: true,
          whitelisted_range: vps_ip,
          last_analyzed_at: new Date().toISOString(),
        }, { 
          onConflict: 'provider,credential_type',
          ignoreDuplicates: false 
        });

      if (permError) {
        console.error(`[sync-ip-whitelist] Failed to update permissions for ${exchange.exchange_name}:`, permError);
        results.push({
          exchange: exchange.exchange_name,
          status: 'error',
        });
      } else {
        results.push({
          exchange: exchange.exchange_name,
          status: 'ip_registered',
          whitelistUrl: whitelistUrls[exchange.exchange_name.toLowerCase()],
        });
      }
    }

    console.log('[sync-ip-whitelist] Sync complete:', results);

    return new Response(
      JSON.stringify({
        success: true,
        vps_ip,
        exchanges_synced: results.length,
        results,
        message: results.length > 0 
          ? `IP ${vps_ip} registered for ${results.length} exchange(s). Please whitelist manually in each exchange.`
          : 'No connected exchanges found.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[sync-ip-whitelist] Error:', errMessage);
    return new Response(
      JSON.stringify({ success: false, error: errMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
