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

    const { reportType = 'daily' } = await req.json().catch(() => ({}));
    console.log(`[trading-report] Generating ${reportType} report...`);

    const { data: telegramConfig } = await supabase
      .from('telegram_config')
      .select('bot_token, chat_id, notifications_enabled')
      .single();

    if (!telegramConfig?.bot_token || !telegramConfig?.chat_id || !telegramConfig.notifications_enabled) {
      return new Response(JSON.stringify({ success: false, error: 'Telegram not configured' }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const now = new Date();
    const startDate = reportType === 'weekly' 
      ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Fetch trades
    const { data: trades } = await supabase
      .from('trading_journal')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    const closedTrades = trades?.filter(t => t.status === 'closed' && t.pnl !== null) || [];
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0);
    const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;

    // Fetch AI accuracy
    const { data: aiDecisions } = await supabase
      .from('ai_trade_decisions')
      .select('ai_provider, actual_profit, was_executed')
      .gte('created_at', startDate.toISOString())
      .eq('was_executed', true)
      .not('actual_profit', 'is', null);

    const correctPredictions = aiDecisions?.filter(d => d.actual_profit > 0).length || 0;
    const totalPredictions = aiDecisions?.length || 0;
    const aiAccuracy = totalPredictions > 0 ? (correctPredictions / totalPredictions) * 100 : 0;

    // Build message
    const dateStr = reportType === 'weekly' 
      ? `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const pnlEmoji = totalPnL >= 0 ? '💰' : '📉';
    const header = reportType === 'weekly' ? '📊 WEEKLY TRADING REPORT' : '📊 DAILY P&L SUMMARY';

    let message = `<b>${header}</b>\n<i>${dateStr}</i>\n\n`;
    message += `${pnlEmoji} <b>Total P&L:</b> ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}\n`;
    message += `📈 <b>Win Rate:</b> ${winRate.toFixed(0)}% (${winningTrades.length}/${closedTrades.length})\n`;
    message += `🧠 <b>AI Accuracy:</b> ${aiAccuracy.toFixed(0)}% (${correctPredictions}/${totalPredictions})\n`;
    message += `📋 <b>Total Trades:</b> ${trades?.length || 0}\n\n`;
    message += `✅ Report generated automatically.`;

    // Send to Telegram
    await fetch(`${TELEGRAM_API}${telegramConfig.bot_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramConfig.chat_id, text: message, parse_mode: 'HTML' })
    });

    return new Response(JSON.stringify({ success: true, totalPnL, winRate, aiAccuracy }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[trading-report] Error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
