import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get all connected exchanges
    const { data: connections, error: connError } = await supabase
      .from('exchange_connections')
      .select('exchange_name, balance_usdt, is_connected')
      .eq('is_connected', true);

    if (connError) throw connError;

    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No connected exchanges' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate total balance
    const totalBalance = connections.reduce(
      (sum, conn) => sum + (conn.balance_usdt || 0),
      0
    );

    // Create exchange breakdown
    const exchangeBreakdown = connections
      .filter((c) => c.balance_usdt && c.balance_usdt > 0)
      .map((c) => ({
        exchange: c.exchange_name,
        balance: c.balance_usdt,
      }));

    // Insert snapshot
    const { error: insertError } = await supabase.from('balance_history').insert({
      total_balance: totalBalance,
      exchange_breakdown: exchangeBreakdown,
      snapshot_time: new Date().toISOString(),
    });

    if (insertError) throw insertError;

    console.log(`[equity-snapshot] Recorded snapshot: $${totalBalance.toFixed(2)}`);

    return new Response(
      JSON.stringify({
        success: true,
        totalBalance,
        exchangeCount: connections.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[equity-snapshot] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
