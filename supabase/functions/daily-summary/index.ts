import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TELEGRAM_API = 'https://api.telegram.org/bot';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[daily-summary] Starting daily P&L summary...');

    // Get Telegram config
    const { data: telegramConfig } = await supabase
      .from('telegram_config')
      .select('bot_token, chat_id, notifications_enabled, notify_daily_summary')
      .single();

    if (!telegramConfig?.bot_token || !telegramConfig?.chat_id) {
      console.log('[daily-summary] Telegram not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Telegram not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!telegramConfig.notifications_enabled || !telegramConfig.notify_daily_summary) {
      console.log('[daily-summary] Daily summary notifications disabled');
      return new Response(
        JSON.stringify({ success: false, error: 'Daily summary disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get today's trades
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

    const { data: trades, error: tradesError } = await supabase
      .from('trading_journal')
      .select('*')
      .gte('created_at', startOfDay)
      .lt('created_at', endOfDay);

    if (tradesError) {
      console.error('[daily-summary] Error fetching trades:', tradesError);
      return new Response(
        JSON.stringify({ success: false, error: tradesError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate stats
    const closedTrades = trades?.filter(t => t.status === 'closed' && t.pnl !== null) || [];
    const totalTrades = trades?.length || 0;
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0);
    const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;

    // Find best and worst trades
    let bestTrade = null;
    let worstTrade = null;
    if (closedTrades.length > 0) {
      bestTrade = closedTrades.reduce((best, t) => (t.pnl || 0) > (best.pnl || 0) ? t : best);
      worstTrade = closedTrades.reduce((worst, t) => (t.pnl || 0) < (worst.pnl || 0) ? t : worst);
    }

    // Format date
    const dateStr = today.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });

    // Build message
    const pnlEmoji = totalPnL >= 0 ? '💰' : '📉';
    const pnlSign = totalPnL >= 0 ? '+' : '';
    
    let message = `📊 <b>DAILY P&L SUMMARY - ${dateStr}</b>\n\n`;
    message += `${pnlEmoji} <b>Total P&L:</b> ${pnlSign}$${totalPnL.toFixed(2)}\n`;
    message += `📈 <b>Win Rate:</b> ${winRate.toFixed(0)}% (${winningTrades.length}/${closedTrades.length} trades)\n`;
    
    if (bestTrade) {
      message += `🏆 <b>Best Trade:</b> +$${(bestTrade.pnl || 0).toFixed(2)} (${bestTrade.symbol})\n`;
    }
    if (worstTrade && (worstTrade.pnl || 0) < 0) {
      message += `📉 <b>Worst Trade:</b> $${(worstTrade.pnl || 0).toFixed(2)} (${worstTrade.symbol})\n`;
    }
    
    message += `\n✅ Trading session complete.`;

    if (totalTrades === 0) {
      message = `📊 <b>DAILY P&L SUMMARY - ${dateStr}</b>\n\n📭 No trades executed today.\n\n✅ Trading session complete.`;
    }

    // Send to Telegram
    const response = await fetch(`${TELEGRAM_API}${telegramConfig.bot_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramConfig.chat_id,
        text: message,
        parse_mode: 'HTML'
      })
    });

    const telegramResult = await response.json();
    console.log('[daily-summary] Message sent:', telegramResult.ok);

    // Save snapshot to portfolio_snapshots
    await supabase.from('portfolio_snapshots').insert({
      total_balance: 0, // Would be calculated from exchange balances
      daily_pnl: totalPnL,
      snapshot_date: today.toISOString().split('T')[0]
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        stats: {
          totalTrades,
          closedTrades: closedTrades.length,
          totalPnL,
          winRate
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[daily-summary] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});