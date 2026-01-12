import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BotSignal {
  bot_name: string;
  symbol: string;
  side: 'long' | 'short';
  confidence: number;
  expected_move_percent?: number;
  timeframe_minutes?: number;
  current_price?: number;
  exchange_name?: string;
}

const VALID_BOT_NAMES = ['freqtrade', 'jesse', 'vnpy', 'superalgos', 'backtrader', 'hummingbot', 'octobot', 'custom'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const signal: BotSignal = await req.json();
    console.log('[bot-signal-receiver] Received signal:', JSON.stringify(signal));

    // Validate required fields
    if (!signal.bot_name || !signal.symbol || !signal.side || signal.confidence === undefined) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: bot_name, symbol, side, confidence' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate bot_name
    const normalizedBotName = signal.bot_name.toLowerCase();
    if (!VALID_BOT_NAMES.includes(normalizedBotName)) {
      console.log(`[bot-signal-receiver] Unknown bot: ${signal.bot_name}, treating as custom`);
    }

    // Validate side
    if (!['long', 'short'].includes(signal.side)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid side. Must be "long" or "short"' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate confidence (0-100)
    const confidence = Math.max(0, Math.min(100, Number(signal.confidence)));

    // Normalize symbol (ensure USDT suffix)
    let normalizedSymbol = signal.symbol.toUpperCase().replace(/[/-]/g, '');
    if (!normalizedSymbol.endsWith('USDT')) {
      normalizedSymbol += 'USDT';
    }

    // Insert into bot_signals table
    const { data: signalData, error: signalError } = await supabase
      .from('bot_signals')
      .insert({
        bot_name: normalizedBotName,
        symbol: normalizedSymbol,
        side: signal.side,
        confidence: confidence,
        expected_move_percent: signal.expected_move_percent || null,
        timeframe_minutes: signal.timeframe_minutes || 5,
        current_price: signal.current_price || null,
        exchange_name: signal.exchange_name || 'binance',
        processed: false
      })
      .select()
      .single();

    if (signalError) {
      console.error('[bot-signal-receiver] Insert error:', signalError);
      return new Response(
        JSON.stringify({ success: false, error: signalError.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Also create an ai_market_updates entry for dashboard visibility
    // Use 'long'/'short' consistently (not 'buy'/'sell') for SPOT mode filtering
    const recommendedSide = signal.side; // Keep as 'long' or 'short'
    const { error: updateError } = await supabase
      .from('ai_market_updates')
      .insert({
        exchange_name: signal.exchange_name || 'binance',
        symbol: normalizedSymbol,
        insight: `${signal.bot_name.toUpperCase()} signal: ${signal.side.toUpperCase()} with ${confidence}% confidence`,
        sentiment: signal.side === 'long' ? 'bullish' : 'bearish',
        recommended_side: recommendedSide,
        confidence: confidence,
        current_price: signal.current_price || null,
        expected_move_percent: signal.expected_move_percent || null,
        profit_timeframe_minutes: signal.timeframe_minutes || 5,
        ai_provider: signal.bot_name
      });

    if (updateError) {
      console.error('[bot-signal-receiver] AI update insert warning:', updateError);
      // Don't fail - the main signal was recorded
    }

    console.log(`[bot-signal-receiver] Signal recorded: ${normalizedBotName} ${signal.side} ${normalizedSymbol}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        signal_id: signalData.id,
        message: `Signal from ${normalizedBotName} recorded successfully`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[bot-signal-receiver] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
