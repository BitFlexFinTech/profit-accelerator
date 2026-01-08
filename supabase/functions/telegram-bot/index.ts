import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TELEGRAM_API = 'https://api.telegram.org/bot';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, ...params } = await req.json();
    console.log(`[telegram-bot] Action: ${action}`, params);

    switch (action) {
      case 'validate': {
        // Validate bot token with Telegram API
        const { botToken } = params;
        const response = await fetch(`${TELEGRAM_API}${botToken}/getMe`);
        const data = await response.json();
        
        if (!data.ok) {
          return new Response(
            JSON.stringify({ success: false, error: 'Invalid bot token' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`[telegram-bot] Bot validated: @${data.result.username}`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            bot: {
              username: data.result.username,
              firstName: data.result.first_name
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-updates': {
        // Poll for /start command to get chat_id
        const { botToken } = params;
        const response = await fetch(`${TELEGRAM_API}${botToken}/getUpdates?limit=10&offset=-10`);
        const data = await response.json();

        if (!data.ok) {
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to get updates' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Find the most recent /start command
        const startMessage = data.result
          ?.reverse()
          ?.find((update: any) => update.message?.text === '/start');

        if (startMessage) {
          const chatId = startMessage.message.chat.id.toString();
          console.log(`[telegram-bot] Found chat_id: ${chatId}`);
          return new Response(
            JSON.stringify({ success: true, chatId }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, chatId: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'save-config': {
        // Save bot token and chat_id to database
        const { botToken, chatId } = params;
        
        // First, delete any existing config
        await supabase.from('telegram_config').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        
        // Insert new config
        const { error } = await supabase.from('telegram_config').insert({
          bot_token: botToken,
          chat_id: chatId,
          notifications_enabled: true,
          notify_on_trade: true,
          notify_on_error: true,
          notify_daily_summary: true
        });

        if (error) {
          console.error('[telegram-bot] Failed to save config:', error);
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[telegram-bot] Config saved successfully');
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'send-message': {
        // Send a message to the configured chat
        const { message, chatId: paramChatId, botToken: paramBotToken } = params;
        
        let botToken = paramBotToken;
        let chatId = paramChatId;

        // If not provided, get from database
        if (!botToken || !chatId) {
          const { data: config } = await supabase
            .from('telegram_config')
            .select('bot_token, chat_id, notifications_enabled')
            .single();

          if (!config?.bot_token || !config?.chat_id) {
            return new Response(
              JSON.stringify({ success: false, error: 'Telegram not configured' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          if (!config.notifications_enabled) {
            return new Response(
              JSON.stringify({ success: false, error: 'Notifications disabled' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          botToken = config.bot_token;
          chatId = config.chat_id;
        }

        const response = await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
          })
        });

        const data = await response.json();
        console.log('[telegram-bot] Message sent:', data.ok);

        return new Response(
          JSON.stringify({ success: data.ok }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'process-command': {
        // Process incoming Telegram commands
        const { command, chatId: incomingChatId } = params;
        
        // Verify the chat_id matches our saved config
        const { data: config } = await supabase
          .from('telegram_config')
          .select('bot_token, chat_id')
          .single();

        if (!config || config.chat_id !== incomingChatId) {
          console.log('[telegram-bot] Unauthorized command attempt');
          return new Response(
            JSON.stringify({ success: false, error: 'Unauthorized' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Handle /status command
        if (command === '/status') {
          console.log('[telegram-bot] Processing /status command');
          
          // Get trading config
          const { data: tradingConfig } = await supabase
            .from('trading_config')
            .select('trading_enabled, global_kill_switch_enabled')
            .single();

          // Get VPS config
          const { data: vpsConfig } = await supabase
            .from('vps_config')
            .select('region, status')
            .single();

          // Get exchange connections
          const { data: exchanges } = await supabase
            .from('exchange_connections')
            .select('exchange_name, is_connected, balance_usdt');

          const connectedCount = exchanges?.filter(e => e.is_connected).length || 0;
          const totalExchanges = exchanges?.length || 0;
          const totalBalance = exchanges?.reduce((sum, e) => sum + (e.balance_usdt || 0), 0) || 0;

          // Get active trades
          const { data: openTrades } = await supabase
            .from('trading_journal')
            .select('id')
            .eq('status', 'open');

          const statusMessage = `📊 <b>SYSTEM STATUS</b>

🖥️ <b>VPS:</b> ${vpsConfig?.status === 'running' ? '✅ Running' : '⚠️ ' + (vpsConfig?.status || 'Unknown')} (${vpsConfig?.region || 'Tokyo'})
📈 <b>Trading:</b> ${tradingConfig?.trading_enabled ? '✅ ENABLED' : '❌ DISABLED'}
🛑 <b>Kill Switch:</b> ${tradingConfig?.global_kill_switch_enabled ? '🔴 ACTIVE' : '🟢 OFF'}
🔄 <b>Active Positions:</b> ${openTrades?.length || 0}

<b>Exchanges Online:</b> ${connectedCount}/${totalExchanges}
💰 <b>Total Balance:</b> $${totalBalance.toLocaleString()} USDT`;

          await fetch(`${TELEGRAM_API}${config.bot_token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: config.chat_id,
              text: statusMessage,
              parse_mode: 'HTML'
            })
          });

          return new Response(
            JSON.stringify({ success: true, action: 'status_sent' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Handle /balance command
        if (command === '/balance') {
          console.log('[telegram-bot] Processing /balance command');
          
          const { data: exchanges } = await supabase
            .from('exchange_connections')
            .select('exchange_name, balance_usdt, is_connected')
            .eq('is_connected', true)
            .order('balance_usdt', { ascending: false });

          if (!exchanges?.length) {
            await fetch(`${TELEGRAM_API}${config.bot_token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: config.chat_id,
                text: '💰 <b>PORTFOLIO BALANCE</b>\n\nNo exchanges connected.',
                parse_mode: 'HTML'
              })
            });

            return new Response(
              JSON.stringify({ success: true, action: 'balance_sent' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const totalBalance = exchanges.reduce((sum, e) => sum + (e.balance_usdt || 0), 0);
          const balanceLines = exchanges.map(e => 
            `${e.exchange_name}: $${(e.balance_usdt || 0).toLocaleString()}`
          ).join('\n');

          const balanceMessage = `💰 <b>PORTFOLIO BALANCE</b>

${balanceLines}

━━━━━━━━━━━━━━━━━━━━━
📊 <b>Total:</b> $${totalBalance.toLocaleString()} USDT`;

          await fetch(`${TELEGRAM_API}${config.bot_token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: config.chat_id,
              text: balanceMessage,
              parse_mode: 'HTML'
            })
          });

          return new Response(
            JSON.stringify({ success: true, action: 'balance_sent' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Handle /kill command
        if (command === '/kill') {
          console.log('[telegram-bot] Processing /kill command');
          
          // Update vps_config to emergency_stopped
          const { error: vpsError } = await supabase
            .from('vps_config')
            .update({ 
              status: 'emergency_stopped',
              emergency_stopped_at: new Date().toISOString()
            })
            .neq('id', '00000000-0000-0000-0000-000000000000');

          // Disable trading and enable kill switch
          const { error: tradingError } = await supabase
            .from('trading_config')
            .update({ 
              trading_enabled: false,
              global_kill_switch_enabled: true
            })
            .neq('id', '00000000-0000-0000-0000-000000000000');

          // Log to audit
          await supabase.from('audit_logs').insert({
            action: 'kill_switch_activated',
            entity_type: 'system',
            entity_id: 'telegram',
            new_value: { source: 'telegram_command', timestamp: new Date().toISOString() }
          });

          if (vpsError || tradingError) {
            console.error('[telegram-bot] Kill switch error:', vpsError || tradingError);
          }

          // Send confirmation message
          await fetch(`${TELEGRAM_API}${config.bot_token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: config.chat_id,
              text: '🚨 <b>EMERGENCY KILL-SWITCH ACTIVATED</b>\n\n⛔ All trading halted immediately.\n🔒 Global kill switch enabled.\n\nUse the dashboard to resume trading.',
              parse_mode: 'HTML'
            })
          });

          console.log('[telegram-bot] Kill switch activated via Telegram');
          return new Response(
            JSON.stringify({ success: true, action: 'kill_switch_activated' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Handle /analyze command
        if (command.startsWith('/analyze')) {
          console.log('[telegram-bot] Processing /analyze command');
          
          const parts = command.split(' ');
          const symbol = parts[1]?.toUpperCase() || 'BTC';
          
          // Check if AI is configured
          const { data: aiConfig } = await supabase
            .from('ai_config')
            .select('api_key, model, is_active')
            .eq('provider', 'groq')
            .single();

          if (!aiConfig?.api_key || !aiConfig.is_active) {
            await fetch(`${TELEGRAM_API}${config.bot_token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: config.chat_id,
                text: '❌ <b>AI Analysis Not Configured</b>\n\nPlease set up Groq AI in the Settings tab first.',
                parse_mode: 'HTML'
              })
            });

            return new Response(
              JSON.stringify({ success: false, error: 'AI not configured' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Send "analyzing" message
          await fetch(`${TELEGRAM_API}${config.bot_token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: config.chat_id,
              text: `🔄 Analyzing ${symbol}/USDT...`,
              parse_mode: 'HTML'
            })
          });

          // Call Groq API for analysis
          const analysisPrompt = `You are an expert cryptocurrency trader. Analyze ${symbol}/USDT and provide a concise trading sentiment report.

Provide your analysis in this exact format:
📊 Sentiment: [BULLISH/BEARISH/NEUTRAL] ([confidence]%)
📈 Trend: [brief trend description]

💡 Key Levels:
   • Support: $[price]
   • Resistance: $[price]

🔮 Short-term Outlook:
[2-3 sentences about price action and what to watch for]

📌 Trade Idea: [One actionable suggestion]

⚠️ Risk: [One key risk factor]

Be professional and concise.`;

          const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${aiConfig.api_key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: aiConfig.model || 'llama-3.3-70b-versatile',
              messages: [
                { role: 'system', content: 'You are a professional crypto trading analyst.' },
                { role: 'user', content: analysisPrompt }
              ],
              max_tokens: 500,
              temperature: 0.7,
            }),
          });

          if (!groqResponse.ok) {
            const errorText = await groqResponse.text();
            console.error('[telegram-bot] Groq API error:', errorText);
            
            await fetch(`${TELEGRAM_API}${config.bot_token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: config.chat_id,
                text: '❌ <b>AI Analysis Failed</b>\n\nPlease try again later.',
                parse_mode: 'HTML'
              })
            });

            return new Response(
              JSON.stringify({ success: false, error: 'Groq API error' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const groqData = await groqResponse.json();
          const analysis = groqData.choices?.[0]?.message?.content || 'Analysis unavailable';

          // Update last_used_at
          await supabase
            .from('ai_config')
            .update({ last_used_at: new Date().toISOString() })
            .eq('provider', 'groq');

          // Log to audit
          await supabase.from('audit_logs').insert({
            action: 'ai_analysis_telegram',
            entity_type: 'ai',
            entity_id: symbol,
            new_value: { symbol, model: aiConfig.model, source: 'telegram' }
          });

          // Send analysis
          const analysisMessage = `🤖 <b>AI ANALYSIS: ${symbol}/USDT</b>

${analysis}

<i>Powered by Groq AI (${aiConfig.model})</i>`;

          await fetch(`${TELEGRAM_API}${config.bot_token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: config.chat_id,
              text: analysisMessage,
              parse_mode: 'HTML'
            })
          });

          console.log(`[telegram-bot] AI analysis sent for ${symbol}`);
          return new Response(
            JSON.stringify({ success: true, action: 'analysis_sent', symbol }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: false, error: 'Unknown command' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'kill-switch': {
        // Direct kill switch from the UI
        console.log('[telegram-bot] Processing kill switch from UI');
        
        // Get Telegram config
        const { data: config } = await supabase
          .from('telegram_config')
          .select('bot_token, chat_id')
          .single();

        // Update vps_config to emergency_stopped
        const { error: vpsError } = await supabase
          .from('vps_config')
          .update({ 
            status: 'emergency_stopped',
            emergency_stopped_at: new Date().toISOString()
          })
          .neq('id', '00000000-0000-0000-0000-000000000000');

        // Disable trading and enable kill switch
        const { error: tradingError } = await supabase
          .from('trading_config')
          .update({ 
            trading_enabled: false,
            global_kill_switch_enabled: true
          })
          .neq('id', '00000000-0000-0000-0000-000000000000');

        // Log to audit
        await supabase.from('audit_logs').insert({
          action: 'kill_switch_activated',
          entity_type: 'system',
          entity_id: 'dashboard',
          new_value: { source: 'dashboard_ui', timestamp: new Date().toISOString() }
        });

        if (vpsError || tradingError) {
          console.error('[telegram-bot] Kill switch error:', vpsError || tradingError);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to activate kill switch' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Send Telegram notification if configured
        if (config?.bot_token && config?.chat_id) {
          await fetch(`${TELEGRAM_API}${config.bot_token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: config.chat_id,
              text: '🚨 <b>EMERGENCY KILL-SWITCH ACTIVATED</b>\n\n⛔ All trading halted from dashboard.\n🔒 Global kill switch enabled.',
              parse_mode: 'HTML'
            })
          });
        }

        console.log('[telegram-bot] Kill switch activated');
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'kill-switch-with-code': {
        // Kill switch with code validation from dashboard
        const { killCode } = params;
        console.log('[telegram-bot] Processing kill switch with code validation');
        
        // Get stored kill code from system_secrets
        const { data: secretData } = await supabase
          .from('system_secrets')
          .select('secret_value')
          .eq('secret_name', 'KILL_SWITCH_CODE')
          .single();
        
        // Default code is 123456 if not configured
        const storedCode = secretData?.secret_value || '123456';
        
        if (killCode !== storedCode) {
          console.log('[telegram-bot] Invalid kill code provided');
          return new Response(
            JSON.stringify({ success: false, error: 'Invalid kill code' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Get Telegram config
        const { data: config } = await supabase
          .from('telegram_config')
          .select('bot_token, chat_id')
          .single();

        // Update vps_config to emergency_stopped
        await supabase
          .from('vps_config')
          .update({ 
            status: 'emergency_stopped',
            emergency_stopped_at: new Date().toISOString()
          })
          .neq('id', '00000000-0000-0000-0000-000000000000');

        // Disable trading and enable kill switch
        await supabase
          .from('trading_config')
          .update({ 
            trading_enabled: false,
            global_kill_switch_enabled: true,
            bot_status: 'stopped'
          })
          .neq('id', '00000000-0000-0000-0000-000000000000');

        // Stop bot on VPS if possible
        const { data: deployment } = await supabase
          .from('hft_deployments')
          .select('id, server_id')
          .eq('status', 'active')
          .limit(1)
          .single();

        if (deployment) {
          try {
            await supabase.functions.invoke('bot-control', {
              body: { action: 'stop', deploymentId: deployment.id || deployment.server_id }
            });
          } catch (e) {
            console.error('[telegram-bot] Failed to stop bot on VPS:', e);
          }
        }

        // Log to audit
        await supabase.from('audit_logs').insert({
          action: 'kill_switch_activated',
          entity_type: 'system',
          entity_id: 'dashboard_with_code',
          new_value: { source: 'dashboard_killswitch_validated', timestamp: new Date().toISOString() }
        });

        // Send Telegram notification if configured
        if (config?.bot_token && config?.chat_id) {
          await fetch(`${TELEGRAM_API}${config.bot_token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: config.chat_id,
              text: '🚨 <b>EMERGENCY KILL-SWITCH ACTIVATED</b>\n\n⛔ All trading halted from dashboard with code verification.\n🔒 Global kill switch enabled.\n🛑 Bot stopped on VPS.',
              parse_mode: 'HTML'
            })
          });
        }

        console.log('[telegram-bot] Kill switch with code activated');
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'trade-notification': {
        // Send trade notification
        const { trade } = params;
        
        const { data: config } = await supabase
          .from('telegram_config')
          .select('bot_token, chat_id, notifications_enabled, notify_on_trade')
          .single();

        if (!config?.bot_token || !config?.chat_id || !config.notifications_enabled || !config.notify_on_trade) {
          return new Response(
            JSON.stringify({ success: false, error: 'Trade notifications disabled' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const sideEmoji = trade.side === 'long' || trade.side === 'buy' ? '📈' : '📉';
        const message = `🔔 <b>NEW TRADE EXECUTED</b>

📊 <b>Pair:</b> ${trade.symbol}
💰 <b>Price:</b> $${Number(trade.entry_price).toLocaleString()}
📦 <b>Size:</b> ${trade.quantity}
${sideEmoji} <b>Side:</b> ${trade.side.toUpperCase()}

🤖 <b>AI Reasoning:</b>
${trade.ai_reasoning || 'Manual trade from dashboard'}`;

        await fetch(`${TELEGRAM_API}${config.bot_token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: config.chat_id,
            text: message,
            parse_mode: 'HTML'
          })
        });

        console.log('[telegram-bot] Trade notification sent');
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Unknown action' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[telegram-bot] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
