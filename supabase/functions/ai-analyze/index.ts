import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AI Provider Configuration - Multi-provider rotation for rate limit handling
const AI_PROVIDER_CONFIG: Record<string, { 
  type: 'openai' | 'gemini'; 
  endpoint: string; 
  envKey: string;
  model: string;
  fastModel?: string;
}> = {
  groq: { 
    type: 'openai', 
    endpoint: 'https://api.groq.com/openai/v1/chat/completions', 
    envKey: 'GROQ_API_KEY',
    model: 'llama-3.3-70b-versatile',
    fastModel: 'llama-3.1-8b-instant'
  },
  cerebras: { 
    type: 'openai', 
    endpoint: 'https://api.cerebras.ai/v1/chat/completions', 
    envKey: 'CEREBRAS_API_KEY',
    model: 'llama3.1-70b',
    fastModel: 'llama3.1-8b'
  },
  together: { 
    type: 'openai', 
    endpoint: 'https://api.together.xyz/v1/chat/completions', 
    envKey: 'TOGETHER_API_KEY',
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    fastModel: 'meta-llama/Llama-3.2-3B-Instruct-Turbo'
  },
  openrouter: { 
    type: 'openai', 
    endpoint: 'https://openrouter.ai/api/v1/chat/completions', 
    envKey: 'OPENROUTER_API_KEY',
    model: 'meta-llama/llama-3.3-70b-instruct',
    fastModel: 'meta-llama/llama-3.2-3b-instruct'
  },
  mistral: { 
    type: 'openai', 
    endpoint: 'https://api.mistral.ai/v1/chat/completions', 
    envKey: 'MISTRAL_API_KEY',
    model: 'mistral-large-latest',
    fastModel: 'mistral-small-latest'
  },
  gemini: { 
    type: 'gemini', 
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', 
    envKey: 'GEMINI_API_KEY',
    model: 'gemini-1.5-flash',
    fastModel: 'gemini-1.5-flash'
  }
};

// Exchange API endpoints for fetching top pairs by volume
const EXCHANGE_ENDPOINTS: Record<string, { ticker24h: string; parseTop10: (data: any) => string[] }> = {
  binance: {
    ticker24h: 'https://api.binance.com/api/v3/ticker/24hr',
    parseTop10: (data: any[]) => data
      .filter((t: any) => t.symbol.endsWith('USDT') && !t.symbol.includes('UP') && !t.symbol.includes('DOWN'))
      .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 10)
      .map((t: any) => t.symbol)
  },
  okx: {
    ticker24h: 'https://www.okx.com/api/v5/market/tickers?instType=SPOT',
    parseTop10: (data: any) => (data.data || [])
      .filter((t: any) => t.instId.endsWith('-USDT'))
      .sort((a: any, b: any) => parseFloat(b.volCcy24h) - parseFloat(a.volCcy24h))
      .slice(0, 10)
      .map((t: any) => t.instId.replace('-USDT', 'USDT'))
  },
  bybit: {
    ticker24h: 'https://api.bybit.com/v5/market/tickers?category=spot',
    parseTop10: (data: any) => (data.result?.list || [])
      .filter((t: any) => t.symbol.endsWith('USDT'))
      .sort((a: any, b: any) => parseFloat(b.turnover24h) - parseFloat(a.turnover24h))
      .slice(0, 10)
      .map((t: any) => t.symbol)
  }
};

// Price cache with 5 second TTL (faster updates)
const priceCache: Map<string, { price: number; change: number; timestamp: number }> = new Map();
const CACHE_TTL_MS = 5000;

async function fetchPriceData(symbol: string, exchange: string): Promise<{ price: number; change: number } | null> {
  const cacheKey = `${exchange}:${symbol}`;
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { price: cached.price, change: cached.change };
  }

  try {
    let url: string;
    const cleanSymbol = symbol.replace('USDT', '');
    
    if (exchange === 'okx') {
      url = `https://www.okx.com/api/v5/market/ticker?instId=${cleanSymbol}-USDT`;
    } else if (exchange === 'bybit') {
      url = `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`;
    } else {
      url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
    }

    const resp = await fetch(url);
    if (!resp.ok) return null;

    const raw = await resp.json();
    let price = 0, change = 0;

    if (exchange === 'okx' && raw.data?.[0]) {
      price = parseFloat(raw.data[0].last);
      change = ((price - parseFloat(raw.data[0].open24h)) / parseFloat(raw.data[0].open24h)) * 100;
    } else if (exchange === 'bybit' && raw.result?.list?.[0]) {
      price = parseFloat(raw.result.list[0].lastPrice);
      change = parseFloat(raw.result.list[0].price24hPcnt) * 100;
    } else {
      price = parseFloat(raw.lastPrice || '0');
      change = parseFloat(raw.priceChangePercent || '0');
    }

    priceCache.set(cacheKey, { price, change, timestamp: Date.now() });
    return { price, change };
  } catch (e) {
    console.error(`[ai-analyze] Failed to fetch price for ${symbol}:`, e);
    return null;
  }
}

async function getTop10Pairs(exchange: string): Promise<string[]> {
  const config = EXCHANGE_ENDPOINTS[exchange] || EXCHANGE_ENDPOINTS.binance;
  try {
    const resp = await fetch(config.ticker24h);
    if (!resp.ok) {
      console.log(`[ai-analyze] Failed to fetch tickers for ${exchange}, using defaults`);
      return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'BNBUSDT', 'MATICUSDT'];
    }
    const data = await resp.json();
    return config.parseTop10(data);
  } catch (e) {
    console.error(`[ai-analyze] Error fetching top pairs for ${exchange}:`, e);
    return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'BNBUSDT', 'MATICUSDT'];
  }
}

// Get next available AI provider based on priority, rate limits (RPM + RPD)
async function getNextAvailableProvider(supabase: any): Promise<{
  provider: string;
  apiKey: string;
  config: typeof AI_PROVIDER_CONFIG[string];
} | null> {
  try {
    // Reset expired rate limits (providers not used in last minute)
    await supabase.rpc('reset_ai_provider_usage');
    // Reset daily limits at midnight UTC
    await supabase.rpc('reset_ai_provider_daily_usage');
  } catch (e) {
    console.log('[ai-analyze] Could not reset provider usage, continuing...');
  }

  // Query enabled providers sorted by remaining daily capacity (highest first)
  const { data: providers } = await supabase
    .from('ai_providers')
    .select('provider_name, rate_limit_rpm, current_usage, rate_limit_rpd, daily_usage, priority, secret_name')
    .eq('is_enabled', true)
    .order('priority', { ascending: true });

  if (!providers?.length) {
    console.log('[ai-analyze] No enabled providers found in database');
    // Fallback to env-based provider check
    for (const [name, config] of Object.entries(AI_PROVIDER_CONFIG)) {
      const apiKey = Deno.env.get(config.envKey);
      if (apiKey && apiKey.length > 20 && !apiKey.includes('test_key')) {
        console.log(`[ai-analyze] Fallback to env provider: ${name}`);
        return { provider: name, apiKey, config };
      }
    }
    return null;
  }

  // Sort by remaining daily capacity (descending) - prioritize providers with more quota left
  const sortedProviders = [...providers].sort((a, b) => {
    const aRemaining = (a.rate_limit_rpd || 1000) - (a.daily_usage || 0);
    const bRemaining = (b.rate_limit_rpd || 1000) - (b.daily_usage || 0);
    if (aRemaining !== bRemaining) return bRemaining - aRemaining;
    return (a.priority || 999) - (b.priority || 999);
  });

  // Find first provider under BOTH rate limits with valid API key
  for (const p of sortedProviders) {
    const minuteUsage = p.current_usage || 0;
    const minuteLimit = p.rate_limit_rpm || 30;
    const dailyUsage = p.daily_usage || 0;
    const dailyLimit = p.rate_limit_rpd || 1000;
    
    // Check minute rate limit
    if (minuteUsage >= minuteLimit) {
      console.log(`[ai-analyze] Provider ${p.provider_name} at minute limit (${minuteUsage}/${minuteLimit})`);
      continue;
    }
    
    // Check daily rate limit (skip if >90% used to preserve quota)
    if (dailyUsage >= dailyLimit * 0.95) {
      console.log(`[ai-analyze] Provider ${p.provider_name} near daily limit (${dailyUsage}/${dailyLimit})`);
      continue;
    }

    const config = AI_PROVIDER_CONFIG[p.provider_name];
    if (!config) continue;

    const apiKey = Deno.env.get(config.envKey);
    if (!apiKey || apiKey.length < 20 || apiKey.includes('test_key')) {
      console.log(`[ai-analyze] Provider ${p.provider_name} has no valid API key`);
      continue;
    }

    const remainingPct = Math.round(((dailyLimit - dailyUsage) / dailyLimit) * 100);
    console.log(`[ai-analyze] Selected provider: ${p.provider_name} (min: ${minuteUsage}/${minuteLimit}, day: ${dailyUsage}/${dailyLimit}, ${remainingPct}% remaining)`);
    return { provider: p.provider_name, apiKey, config };
  }

  console.log('[ai-analyze] All providers at rate limit');
  return null;
}

// Record provider metrics after API call
async function recordProviderMetrics(
  supabase: any,
  providerName: string,
  success: boolean,
  latencyMs: number,
  errorMessage?: string
) {
  try {
    const updateData: any = {
      last_used_at: new Date().toISOString(),
    };

    if (success) {
      // Use raw SQL update for atomic increment
      await supabase.rpc('increment_provider_success', { p_name: providerName, latency: latencyMs });
    } else {
      await supabase
        .from('ai_providers')
        .update({
          error_count: supabase.sql`error_count + 1`,
          last_error: errorMessage || 'Unknown error',
          last_used_at: new Date().toISOString()
        })
        .eq('provider_name', providerName);
    }

    // Increment both minute and daily usage
    const { error: usageError } = await supabase
      .from('ai_providers')
      .update({ 
        current_usage: supabase.sql`current_usage + 1`,
        daily_usage: supabase.sql`daily_usage + 1`
      })
      .eq('provider_name', providerName);
      
    if (usageError) {
      console.error(`[ai-analyze] Usage update error for ${providerName}:`, usageError);
    }
  } catch (e) {
    console.error(`[ai-analyze] Failed to record metrics for ${providerName}:`, e);
  }
}

// Call OpenAI-compatible API (Groq, Cerebras, Together, OpenRouter, Mistral)
async function callOpenAICompatible(
  prompt: string,
  systemPrompt: string,
  model: string,
  endpoint: string,
  apiKey: string,
  maxTokens: number = 120
): Promise<{ content: string; latencyMs: number }> {
  const startTime = Date.now();
  
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  
  // OpenRouter requires extra headers
  if (endpoint.includes('openrouter')) {
    headers['HTTP-Referer'] = 'https://lovable.dev';
    headers['X-Title'] = 'HFT Trading Bot';
  }

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: maxTokens,
    }),
  });

  const latencyMs = Date.now() - startTime;

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`API error ${resp.status}: ${errText.slice(0, 150)}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  return { content, latencyMs };
}

// Call Gemini API (different format)
async function callGeminiAPI(
  prompt: string,
  systemPrompt: string,
  apiKey: string
): Promise<{ content: string; latencyMs: number }> {
  const startTime = Date.now();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `${systemPrompt}\n\n${prompt}` }]
      }],
      generationConfig: {
        maxOutputTokens: 120,
        temperature: 0.7
      }
    }),
  });

  const latencyMs = Date.now() - startTime;

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${errText.slice(0, 150)}`);
  }

  const data = await resp.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  return { content, latencyMs };
}

// Analyze symbol with automatic provider rotation
async function analyzeWithRotation(
  supabase: any,
  prompt: string,
  systemPrompt: string,
  useFastModel: boolean = true
): Promise<{ content: string; provider: string } | null> {
  const maxRetries = 3;
  let lastError: string | null = null;
  const triedProviders = new Set<string>();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const providerInfo = await getNextAvailableProvider(supabase);
    
    if (!providerInfo) {
      console.log('[ai-analyze] No available providers');
      return null;
    }

    // Skip if already tried this provider
    if (triedProviders.has(providerInfo.provider)) {
      continue;
    }
    triedProviders.add(providerInfo.provider);

    const { provider, apiKey, config } = providerInfo;
    const model = useFastModel && config.fastModel ? config.fastModel : config.model;

    try {
      let result: { content: string; latencyMs: number };

      if (config.type === 'gemini') {
        result = await callGeminiAPI(prompt, systemPrompt, apiKey);
      } else {
        result = await callOpenAICompatible(prompt, systemPrompt, model, config.endpoint, apiKey);
      }

      // Record success
      await recordProviderMetrics(supabase, provider, true, result.latencyMs);
      console.log(`[ai-analyze] Success with ${provider} in ${result.latencyMs}ms`);
      
      return { content: result.content, provider };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      console.error(`[ai-analyze] Provider ${provider} failed: ${errorMsg}`);
      
      // Record failure
      await recordProviderMetrics(supabase, provider, false, 0, errorMsg);
      lastError = errorMsg;

      // If rate limited (429), mark provider as at limit and try next
      if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
        await supabase
          .from('ai_providers')
          .update({ current_usage: 9999 }) // Max out usage to skip this provider
          .eq('provider_name', provider);
      }
    }
  }

  console.error(`[ai-analyze] All providers failed. Last error: ${lastError}`);
  return null;
}

// Validate any provider API key
async function validateProviderKey(provider: string): Promise<{ valid: boolean; error?: string }> {
  const config = AI_PROVIDER_CONFIG[provider];
  if (!config) {
    return { valid: false, error: `Unknown provider: ${provider}` };
  }

  const apiKey = Deno.env.get(config.envKey);
  if (!apiKey) {
    return { valid: false, error: `${config.envKey} not set in Supabase secrets` };
  }
  
  if (apiKey.length < 20 || apiKey.includes('test_key')) {
    return { valid: false, error: `${config.envKey} appears to be a placeholder` };
  }

  // Quick validation test
  try {
    if (config.type === 'gemini') {
      const result = await callGeminiAPI('Say hi', 'Be brief', apiKey);
      return result.content ? { valid: true } : { valid: false, error: 'Empty response' };
    } else {
      const result = await callOpenAICompatible('Say hi', 'Be brief', config.model, config.endpoint, apiKey, 5);
      return result.content ? { valid: true } : { valid: false, error: 'Empty response' };
    }
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

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
    const { action, symbol, model, provider: targetProvider } = body;
    console.log(`[ai-analyze] Action: ${action}`);

    // Get all providers with status
    if (action === 'get-providers') {
      const { data: providers } = await supabase
        .from('ai_providers')
        .select('*')
        .order('priority', { ascending: true });

      // Check which providers have valid API keys
      const providersWithStatus = await Promise.all((providers || []).map(async (p: any) => {
        const config = AI_PROVIDER_CONFIG[p.provider_name];
        const apiKey = config ? Deno.env.get(config.envKey) : null;
        const hasValidKey = apiKey && apiKey.length > 20 && !apiKey.includes('test_key');
        
        return {
          ...p,
          has_valid_key: hasValidKey,
          at_rate_limit: (p.current_usage || 0) >= (p.rate_limit_rpm || 30)
        };
      }));

      return new Response(JSON.stringify({ success: true, providers: providersWithStatus }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Test a specific provider
    if (action === 'test-provider') {
      if (!targetProvider) {
        return new Response(JSON.stringify({ success: false, error: 'Provider name required' }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      const validation = await validateProviderKey(targetProvider);
      return new Response(JSON.stringify({ success: validation.valid, error: validation.error }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Toggle provider enabled/disabled
    if (action === 'toggle-provider') {
      if (!targetProvider) {
        return new Response(JSON.stringify({ success: false, error: 'Provider name required' }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: current } = await supabase
        .from('ai_providers')
        .select('is_enabled')
        .eq('provider_name', targetProvider)
        .single();

      const { error } = await supabase
        .from('ai_providers')
        .update({ is_enabled: !current?.is_enabled })
        .eq('provider_name', targetProvider);

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true, is_enabled: !current?.is_enabled }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'validate-key') {
      const validation = await validateProviderKey(targetProvider || 'groq');
      return new Response(JSON.stringify({ success: validation.valid, error: validation.error }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'get-config') {
      const { data } = await supabase.from('ai_config').select('provider, model, is_active, last_used_at').eq('provider', 'groq').single();
      return new Response(JSON.stringify({ success: true, config: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'save-config') {
      await supabase.from('ai_config').upsert({ provider: 'groq', model: model || 'llama-3.3-70b-versatile', is_active: true }, { onConflict: 'provider' });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'analyze') {
      const { data: cfg } = await supabase.from('ai_config').select('model, is_active, id').eq('provider', 'groq').single();
      if (cfg && !cfg.is_active) {
        return new Response(JSON.stringify({ success: false, error: 'AI not active' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      const sym = (symbol || 'BTC').toUpperCase();
      let ctx = `${sym}/USDT data.`;
      try {
        const pr = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}USDT`);
        if (pr.ok) { 
          const t = await pr.json(); 
          ctx = `${sym} at $${parseFloat(t.lastPrice).toFixed(2)}, ${parseFloat(t.priceChangePercent).toFixed(2)}% 24h`; 
        }
      } catch {}

      const result = await analyzeWithRotation(
        supabase,
        `Analyze ${sym}. ${ctx} Give sentiment, levels, outlook.`,
        'Crypto analyst.',
        false // Use full model for detailed analysis
      );

      if (!result) {
        return new Response(JSON.stringify({ success: false, error: 'All AI providers unavailable' }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (cfg?.id) {
        await supabase.from('ai_config').update({ last_used_at: new Date().toISOString() }).eq('id', cfg.id);
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        symbol: sym, 
        analysis: result.content,
        provider: result.provider 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'market-scan') {
      console.log('[ai-analyze] market-scan start - multi-provider rotation');
      
      // Get ALL connected exchanges
      const { data: exchanges } = await supabase
        .from('exchange_connections')
        .select('exchange_name')
        .eq('is_connected', true);
      
      if (!exchanges?.length) {
        return new Response(JSON.stringify({ success: false, error: 'No exchanges connected' }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      const { data: cfg } = await supabase.from('ai_config').select('model, id').eq('provider', 'groq').single();
      let totalAnalyzed = 0;
      let totalErrors = 0;
      const exchangeResults: Record<string, number> = {};
      const providersUsed: Set<string> = new Set();

      // Clean old entries (older than 2 minutes)
      await supabase
        .from('ai_market_updates')
        .delete()
        .lt('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString());

      // Process each connected exchange
      for (const ex of exchanges) {
        const exName = ex.exchange_name.toLowerCase();
        console.log(`[ai-analyze] Processing exchange: ${exName}`);
        
        const top10 = await getTop10Pairs(exName);
        console.log(`[ai-analyze] Top 10 for ${exName}:`, top10);
        
        let exchangeCount = 0;
        const pairsToAnalyze = top10.slice(0, 3);
        
        for (const sym of pairsToAnalyze) {
          try {
            const priceData = await fetchPriceData(sym, exName);
            if (!priceData) continue;
            
            const { price, change } = priceData;
            const cleanSymbol = sym.replace('USDT', '');
            
            // Use rotation to call AI
            const result = await analyzeWithRotation(
              supabase,
              `${sym} $${price.toFixed(2)} ${change >= 0 ? '+' : ''}${change.toFixed(2)}%. JSON only:
{"sentiment":"BULLISH"|"BEARISH"|"NEUTRAL","confidence":50-95,"insight":"max 8 words","support":number,"resistance":number,"profit_timeframe_minutes":1|3|5,"recommended_side":"long"|"short","expected_move_percent":0.1-1.0}`,
              'You are an HFT scalping AI. Reply JSON only. Vary confidence 50-95 based on signal strength.',
              true // Use fast model
            );
            
            if (!result) {
              totalErrors++;
              continue;
            }
            
            providersUsed.add(result.provider);
            
            const m = result.content.match(/\{[\s\S]*\}/);
            if (!m) {
              totalErrors++;
              continue;
            }
            
            const a = JSON.parse(m[0]);
            
            let profitTimeframe = parseInt(a.profit_timeframe_minutes) || 5;
            if (![1, 3, 5].includes(profitTimeframe)) profitTimeframe = 5;
            const recommendedSide = a.recommended_side === 'short' ? 'short' : 'long';
            let expectedMove = parseFloat(a.expected_move_percent) || 0.25;
            expectedMove = Math.max(0.1, Math.min(2.0, expectedMove));
            let confidence = parseInt(a.confidence) || 70;
            confidence = Math.max(50, Math.min(95, confidence));
            
            const { error: upsertError } = await supabase.from('ai_market_updates').upsert({
              symbol: cleanSymbol,
              exchange_name: exName,
              sentiment: a.sentiment || 'NEUTRAL',
              confidence: confidence,
              insight: a.insight || 'Analysis pending',
              current_price: price,
              price_change_24h: change,
              support_level: a.support || null,
              resistance_level: a.resistance || null,
              profit_timeframe_minutes: profitTimeframe,
              recommended_side: recommendedSide,
              expected_move_percent: expectedMove,
              ai_provider: result.provider,
              created_at: new Date().toISOString()
            }, { 
              onConflict: 'symbol,exchange_name',
              ignoreDuplicates: false 
            });
            
            if (upsertError) {
              console.error(`[ai-analyze] Upsert error for ${cleanSymbol}:`, upsertError);
            } else {
              exchangeCount++;
              totalAnalyzed++;
            }
            
            // Rate limit delay
            await new Promise(r => setTimeout(r, 1000));
            
          } catch (e) {
            console.error(`[ai-analyze] Error analyzing ${sym}:`, e);
            totalErrors++;
          }
        }
        
        exchangeResults[exName] = exchangeCount;
      }
      
      if (cfg?.id) {
        await supabase.from('ai_config').update({ last_used_at: new Date().toISOString() }).eq('id', cfg.id);
      }
      
      console.log(`[ai-analyze] market-scan complete: ${totalAnalyzed} analyzed, ${totalErrors} errors, providers: ${Array.from(providersUsed).join(', ')}`);
      
      return new Response(JSON.stringify({ 
        success: true, 
        analyzed: totalAnalyzed,
        errors: totalErrors,
        exchanges: exchangeResults,
        providersUsed: Array.from(providersUsed),
        message: `Analyzed top pairs for ${Object.keys(exchangeResults).length} exchange(s)`
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'analyze-last-trade') {
      const { data: trades } = await supabase
        .from('trading_journal')
        .select('*')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(10);
      
      if (!trades?.length) {
        return new Response(JSON.stringify({ success: true, message: 'No closed trades to analyze' }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      const avgHoldTime = trades.reduce((sum, t) => {
        if (t.created_at && t.closed_at) {
          return sum + (new Date(t.closed_at).getTime() - new Date(t.created_at).getTime()) / 1000;
        }
        return sum;
      }, 0) / trades.length;
      
      const winningTrades = trades.filter(t => (t.pnl || 0) > 0);
      const winRate = (winningTrades.length / trades.length) * 100;
      const avgProfit = trades.reduce((sum, t) => sum + (t.pnl || 0), 0) / trades.length;
      
      console.log(`[ai-analyze] Trade analysis: ${trades.length} trades, ${winRate.toFixed(1)}% win rate`);
      
      return new Response(JSON.stringify({ 
        success: true, 
        analysis: {
          tradeCount: trades.length,
          avgHoldTimeSeconds: Math.round(avgHoldTime),
          winRate: Math.round(winRate),
          avgProfitPerTrade: avgProfit
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), 
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[ai-analyze] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
