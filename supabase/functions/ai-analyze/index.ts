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

    const { action, symbol, message } = await req.json();
    console.log(`AI Analyze action: ${action}, symbol: ${symbol}`);

    switch (action) {
      case 'validate-key': {
        const { apiKey } = await req.json().catch(() => ({}));
        
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
        
        // Fetch current price context (mock for now, would use trade-engine in production)
        const priceContext = `Current market data for ${symbolUpper}/USDT.`;

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
        const { apiKey, model } = await req.json().catch(() => ({}));
        
        const { data: existing } = await supabase
          .from('ai_config')
          .select('id')
          .eq('provider', 'groq')
          .single();

        if (existing) {
          const { error } = await supabase
            .from('ai_config')
            .update({
              api_key: apiKey,
              model: model || 'llama-3.3-70b-versatile',
              is_active: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('ai_config')
            .insert({
              provider: 'groq',
              api_key: apiKey,
              model: model || 'llama-3.3-70b-versatile',
              is_active: true,
            });

          if (error) throw error;
        }

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
