import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { action, symbol, message, apiKey, model } = body;
    console.log(`[ai-analyze] Action: ${action}, symbol: ${symbol}, hasApiKey: ${!!apiKey}, apiKeyLength: ${apiKey?.length || 0}`);

    switch (action) {
      case 'validate-key': {
        
        // Get API key from request or database
        let keyToValidate = apiKey;
        if (!keyToValidate) {
          const { data: aiConfig } = await supabase
            .from('ai_config')
            .select('api_key')
            .eq('provider', 'groq')
            .single();
          keyToValidate = aiConfig?.api_key;
        }

        if (!keyToValidate) {
          return new Response(
            JSON.stringify({ success: false, error: 'No API key provided' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Test the key with a simple request
        const testResponse = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${keyToValidate}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: 'Say "OK"' }],
            max_tokens: 5,
          }),
        });

        if (testResponse.ok) {
          return new Response(
            JSON.stringify({ success: true, message: 'API key is valid' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          const error = await testResponse.text();
          return new Response(
            JSON.stringify({ success: false, error: 'Invalid API key', details: error }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'analyze': {
        // Get AI config from database
        const { data: aiConfig, error: configError } = await supabase
          .from('ai_config')
          .select('*')
          .eq('provider', 'groq')
          .single();

        if (configError || !aiConfig?.api_key) {
          return new Response(
            JSON.stringify({ success: false, error: 'Groq AI not configured' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!aiConfig.is_active) {
          return new Response(
            JSON.stringify({ success: false, error: 'AI Analysis is not active' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const symbolUpper = (symbol || 'BTC').toUpperCase();
        
        // Fetch real price data from connected exchanges
        let priceContext = `Current market data for ${symbolUpper}/USDT.`;
        try {
          const priceResponse = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbolUpper}USDT`);
          if (priceResponse.ok) {
            const ticker = await priceResponse.json();
            const price = parseFloat(ticker.lastPrice);
            const change = parseFloat(ticker.priceChangePercent);
            const volume = parseFloat(ticker.volume);
            priceContext = `${symbolUpper}/USDT is trading at $${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}, 24h change: ${change >= 0 ? '+' : ''}${change.toFixed(2)}%, 24h volume: ${volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`;
          }
        } catch (priceErr) {
          console.error('[ai-analyze] Price fetch error:', priceErr);
        }

        const analysisPrompt = `You are an expert cryptocurrency trader and technical analyst. Analyze ${symbolUpper}/USDT and provide a concise trading sentiment report.

${priceContext}

Provide your analysis in this exact format:
📊 Sentiment: [BULLISH/BEARISH/NEUTRAL] ([confidence]%)
📈 Trend: [brief trend description]

💡 Key Levels:
   • Support: $[price]
   • Resistance: $[price]

🔮 Short-term Outlook:
[2-3 sentences about price action, key indicators, and what to watch for]

📌 Trade Idea: [One actionable suggestion]

⚠️ Risk: [One key risk factor to consider]

Keep the analysis professional, actionable, and under 200 words.`;

        const groqResponse = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${aiConfig.api_key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: aiConfig.model || 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: 'You are a professional crypto trading analyst. Be concise and actionable.' },
              { role: 'user', content: analysisPrompt }
            ],
            max_tokens: 500,
            temperature: 0.7,
          }),
        });

        if (!groqResponse.ok) {
          const error = await groqResponse.text();
          console.error('Groq API error:', error);
          return new Response(
            JSON.stringify({ success: false, error: 'AI analysis failed', details: error }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const groqData = await groqResponse.json();
        const analysis = groqData.choices?.[0]?.message?.content || 'Analysis unavailable';

        // Update last_used_at
        await supabase
          .from('ai_config')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', aiConfig.id);

        // Log to audit
        await supabase.from('audit_logs').insert({
          action: 'ai_analysis',
          entity_type: 'ai',
          entity_id: symbolUpper,
          new_value: { symbol: symbolUpper, model: aiConfig.model },
        });

        return new Response(
          JSON.stringify({ 
            success: true, 
            symbol: symbolUpper,
            analysis,
            model: aiConfig.model 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'save-config': {
        const cleanApiKey = apiKey?.trim();
        console.log(`[ai-analyze] SAVE-CONFIG: cleanApiKey length=${cleanApiKey?.length || 0}, model=${model}`);
        
        if (!cleanApiKey || cleanApiKey.length < 10) {
          console.error(`[ai-analyze] ERROR: API key invalid - length=${cleanApiKey?.length || 0}`);
          return new Response(
            JSON.stringify({ success: false, error: 'API key is required (min 10 chars)' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Delete existing groq config and insert fresh to avoid update issues
        console.log(`[ai-analyze] Deleting existing groq config...`);
        await supabase.from('ai_config').delete().eq('provider', 'groq');
        
        console.log(`[ai-analyze] Inserting new groq config with ${cleanApiKey.length} char API key...`);
        const { error } = await supabase.from('ai_config').insert({
          provider: 'groq',
          api_key: cleanApiKey,
          model: model || 'llama-3.3-70b-versatile',
          is_active: true,
        });

        if (error) {
          console.error(`[ai-analyze] Insert error:`, error);
          throw error;
        }
        
        console.log(`[ai-analyze] SUCCESS: Groq config saved with ${cleanApiKey.length} char API key`);

        // Log to audit
        await supabase.from('audit_logs').insert({
          action: 'ai_config_updated',
          entity_type: 'config',
          entity_id: 'groq',
          new_value: { model, is_active: true },
        });

        return new Response(
          JSON.stringify({ success: true, message: 'AI configuration saved' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-config': {
        const { data: aiConfig } = await supabase
          .from('ai_config')
          .select('provider, model, is_active, last_used_at')
          .eq('provider', 'groq')
          .single();

        return new Response(
          JSON.stringify({ success: true, config: aiConfig }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'market-scan': {
        // 24/7 AI Market Scanner - fetches data from connected exchanges ONLY
        console.log('[ai-analyze] Starting market-scan...');
        
        // 1. Get connected exchanges
        const { data: exchanges } = await supabase
          .from('exchange_connections')
          .select('exchange_name, is_connected')
          .eq('is_connected', true);

        if (!exchanges?.length) {
          return new Response(
            JSON.stringify({ success: false, error: 'No exchanges connected' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 2. Get AI config
        const { data: aiConfig } = await supabase
          .from('ai_config')
          .select('*')
          .eq('provider', 'groq')
          .single();

        if (!aiConfig?.api_key || !aiConfig?.is_active) {
          return new Response(
            JSON.stringify({ success: false, error: 'AI not configured or inactive' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 3. Fetch top crypto prices from first connected exchange
        const firstExchange = exchanges[0].exchange_name.toLowerCase();
        const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
        let analyzedCount = 0;

        for (const symbol of symbols) {
          let tickerData: { lastPrice?: string; last?: string; priceChangePercent?: string; open24h?: string } | null = null;

          try {
            // Fetch real price from connected exchange
            if (firstExchange === 'binance') {
              const resp = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
              if (resp.ok) {
                tickerData = await resp.json();
              }
            } else if (firstExchange === 'okx') {
              const instId = symbol.replace('USDT', '-USDT');
              const resp = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
              if (resp.ok) {
                const data = await resp.json();
                tickerData = data.data?.[0];
              }
            } else if (firstExchange === 'bybit') {
              const resp = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`);
              if (resp.ok) {
                const data = await resp.json();
                const ticker = data.result?.list?.[0];
                if (ticker) {
                  tickerData = {
                    lastPrice: ticker.lastPrice,
                    priceChangePercent: String(parseFloat(ticker.price24hPcnt) * 100)
                  };
                }
              }
            } else {
              // Fallback to Binance for price data
              const resp = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
              if (resp.ok) {
                tickerData = await resp.json();
              }
            }

            if (!tickerData) continue;

            // 4. Calculate price and change
            const price = parseFloat(tickerData.lastPrice || tickerData.last || '0');
            let change = 0;
            if (tickerData.priceChangePercent) {
              change = parseFloat(tickerData.priceChangePercent);
            } else if (tickerData.last && tickerData.open24h) {
              change = ((parseFloat(tickerData.last) - parseFloat(tickerData.open24h)) / parseFloat(tickerData.open24h)) * 100;
            }

            // 5. Generate AI analysis
            const analysisPrompt = `Analyze ${symbol} trading at $${price.toFixed(2)}, 24h change: ${change.toFixed(2)}%.
            
Provide a brief 1-sentence insight for traders. Be specific about price levels.
Respond in JSON format only: {"sentiment": "BULLISH" or "BEARISH" or "NEUTRAL", "confidence": 0-100 number, "insight": "one sentence insight", "support": number, "resistance": number}`;

            const groqResponse = await fetch(GROQ_API_URL, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${aiConfig.api_key}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: aiConfig.model || 'llama-3.3-70b-versatile',
                messages: [
                  { role: 'system', content: 'You are a crypto trading analyst. Respond only in valid JSON format.' },
                  { role: 'user', content: analysisPrompt }
                ],
                max_tokens: 200,
                temperature: 0.5,
              }),
            });

            if (!groqResponse.ok) {
              console.error(`[ai-analyze] Groq API error for ${symbol}`);
              continue;
            }

            const groqData = await groqResponse.json();
            const content = groqData.choices?.[0]?.message?.content;

            if (!content) continue;

            // 6. Parse and store analysis
            try {
              // Extract JSON from response (handle markdown code blocks)
              let jsonStr = content;
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                jsonStr = jsonMatch[0];
              }
              
              const analysis = JSON.parse(jsonStr);

              // Store in ai_market_updates
              await supabase.from('ai_market_updates').insert({
                symbol: symbol.replace('USDT', ''),
                exchange_name: firstExchange,
                sentiment: analysis.sentiment || 'NEUTRAL',
                confidence: Math.min(100, Math.max(0, parseInt(analysis.confidence) || 50)),
                insight: analysis.insight || 'Analysis in progress',
                current_price: price,
                price_change_24h: change,
                support_level: analysis.support || null,
                resistance_level: analysis.resistance || null
              });

              analyzedCount++;
            } catch (parseErr) {
              console.error(`[ai-analyze] Failed to parse AI response for ${symbol}:`, parseErr);
            }
          } catch (fetchErr) {
            console.error(`[ai-analyze] Error fetching ${symbol}:`, fetchErr);
          }
        }

        // Update AI config last_used_at
        await supabase
          .from('ai_config')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', aiConfig.id);

        return new Response(
          JSON.stringify({ 
            success: true, 
            analyzed: analyzedCount,
            exchange: firstExchange
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('AI Analyze error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
