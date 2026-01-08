import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-vps-token',
};

interface ExchangeBalance {
  exchange: string;
  balance: number;
  assets?: Record<string, number>;
  error?: string;
}

interface BalancePayload {
  balances: ExchangeBalance[];
  vpsIp?: string;
  timestamp?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Validate VPS token
    const vpsToken = req.headers.get('x-vps-token');
    if (!vpsToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing VPS authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify token against stored tokens in vps_config
    const { data: vpsConfigs } = await supabase
      .from('vps_config')
      .select('vps_token, provider')
      .not('vps_token', 'is', null);

    const validToken = vpsConfigs?.some(config => config.vps_token === vpsToken);
    if (!validToken) {
      console.error('[balance-receiver] Invalid VPS token');
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid VPS token' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: BalancePayload = await req.json();
    const { balances, vpsIp, timestamp } = body;

    if (!balances || !Array.isArray(balances)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid payload: balances array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[balance-receiver] Received ${balances.length} exchange balances from VPS ${vpsIp || 'unknown'}`);

    const now = new Date().toISOString();
    let totalBalance = 0;
    const updatedExchanges: string[] = [];
    const errors: string[] = [];

    // Update each exchange balance
    for (const exchangeData of balances) {
      const { exchange, balance, assets, error: fetchError } = exchangeData;

      if (!exchange) continue;

      if (fetchError) {
        // Update with error but keep previous balance
        const { error: updateError } = await supabase
          .from('exchange_connections')
          .update({
            last_error: fetchError,
            last_error_at: now,
            updated_at: now,
          })
          .eq('exchange_name', exchange);

        if (updateError) {
          errors.push(`${exchange}: ${updateError.message}`);
        }
        continue;
      }

      // Update balance
      const { error: updateError } = await supabase
        .from('exchange_connections')
        .update({
          balance_usdt: balance,
          balance_updated_at: now,
          last_error: null,
          last_error_at: null,
          updated_at: now,
        })
        .eq('exchange_name', exchange);

      if (updateError) {
        errors.push(`${exchange}: ${updateError.message}`);
      } else {
        totalBalance += balance;
        updatedExchanges.push(exchange);
      }
    }

    // Update vps_config with last poll time
    await supabase
      .from('vps_config')
      .update({ last_balance_poll_at: now })
      .eq('vps_token', vpsToken);

    // Throttle balance_history inserts to 1 per minute
    const { data: lastHistory } = await supabase
      .from('balance_history')
      .select('snapshot_time')
      .order('snapshot_time', { ascending: false })
      .limit(1)
      .single();

    const lastSnapshotTime = lastHistory?.snapshot_time ? new Date(lastHistory.snapshot_time) : null;
    const oneMinuteAgo = new Date(Date.now() - 60000);

    if (!lastSnapshotTime || lastSnapshotTime < oneMinuteAgo) {
      // Insert into balance_history
      const exchangeBreakdown = balances
        .filter(b => !b.error && b.balance > 0)
        .map(b => ({ exchange: b.exchange, balance: b.balance }));

      if (totalBalance > 0) {
        await supabase.from('balance_history').insert({
          total_balance: totalBalance,
          exchange_breakdown: exchangeBreakdown,
          snapshot_time: now,
        });
      }
    }

    console.log(`[balance-receiver] Updated ${updatedExchanges.length} exchanges, total: $${totalBalance.toFixed(2)}`);

    return new Response(
      JSON.stringify({
        success: true,
        updated: updatedExchanges,
        totalBalance,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: now,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[balance-receiver] Error:', err);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: err instanceof Error ? err.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
