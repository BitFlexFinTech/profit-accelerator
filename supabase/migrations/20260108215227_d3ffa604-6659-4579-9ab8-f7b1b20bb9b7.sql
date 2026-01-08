-- Create ai_providers table for multi-provider rotation
CREATE TABLE ai_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  api_endpoint TEXT NOT NULL,
  model_name TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT false,
  priority INTEGER DEFAULT 50,
  rate_limit_rpm INTEGER DEFAULT 30,
  current_usage INTEGER DEFAULT 0,
  last_reset_at TIMESTAMPTZ DEFAULT now(),
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  total_latency_ms BIGINT DEFAULT 0,
  last_error TEXT,
  last_used_at TIMESTAMPTZ,
  color_hex TEXT NOT NULL,
  color_class TEXT NOT NULL,
  border_class TEXT NOT NULL,
  secret_name TEXT NOT NULL,
  api_key_field TEXT NOT NULL DEFAULT 'apiKey',
  has_secret BOOLEAN DEFAULT false,
  get_key_url TEXT NOT NULL,
  free_tier_info TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pre-seed with 6 free AI providers (with bright flat colors)
INSERT INTO ai_providers (
  provider_name, display_name, short_name, api_endpoint, model_name, 
  rate_limit_rpm, priority, color_hex, color_class, border_class, 
  secret_name, api_key_field, has_secret, get_key_url, free_tier_info, is_enabled
) VALUES
  ('groq', 'Groq (Ultra Fast)', 'Groq', 'https://api.groq.com/openai/v1/chat/completions', 'llama-3.1-8b-instant', 30, 100, '#F55036', 'bg-red-500/20', 'border-red-500', 'GROQ_API_KEY', 'apiKey', false, 'https://console.groq.com/keys', '30 RPM free', true),
  ('gemini', 'Google Gemini', 'Gemini', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', 'gemini-1.5-flash', 15, 90, '#4285F4', 'bg-blue-500/20', 'border-blue-500', 'GEMINI_API_KEY', 'apiKey', false, 'https://aistudio.google.com/app/apikey', '15 RPM, 1500 RPD', false),
  ('cerebras', 'Cerebras (Fast)', 'Cerebras', 'https://api.cerebras.ai/v1/chat/completions', 'llama3.1-8b', 30, 85, '#00D4AA', 'bg-teal-500/20', 'border-teal-500', 'CEREBRAS_API_KEY', 'apiKey', false, 'https://cloud.cerebras.ai', '30 RPM free', false),
  ('together', 'Together AI', 'Together', 'https://api.together.xyz/v1/chat/completions', 'meta-llama/Llama-3-8b-chat-hf', 60, 80, '#FF6B35', 'bg-orange-500/20', 'border-orange-500', 'TOGETHER_API_KEY', 'apiKey', false, 'https://api.together.xyz', '$5 free credit', false),
  ('openrouter', 'OpenRouter', 'OpenRouter', 'https://openrouter.ai/api/v1/chat/completions', 'meta-llama/llama-3.1-8b-instruct:free', 20, 75, '#9B59B6', 'bg-purple-500/20', 'border-purple-500', 'OPENROUTER_API_KEY', 'apiKey', false, 'https://openrouter.ai/keys', 'Free models available', false),
  ('mistral', 'Mistral AI', 'Mistral', 'https://api.mistral.ai/v1/chat/completions', 'mistral-small-latest', 30, 70, '#FF7000', 'bg-amber-500/20', 'border-amber-500', 'MISTRAL_API_KEY', 'apiKey', false, 'https://console.mistral.ai', '30 RPM free', false);

-- Performance tracking table
CREATE TABLE ai_provider_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL REFERENCES ai_providers(provider_name) ON DELETE CASCADE,
  trades_analyzed INTEGER DEFAULT 0,
  profitable_signals INTEGER DEFAULT 0,
  total_profit_usdt NUMERIC(20,8) DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_provider_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_providers_all" ON ai_providers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ai_provider_performance_all" ON ai_provider_performance FOR ALL USING (true) WITH CHECK (true);

-- Reset usage function (called every minute)
CREATE OR REPLACE FUNCTION reset_ai_provider_usage()
RETURNS void AS $$
BEGIN
  UPDATE ai_providers 
  SET current_usage = 0, last_reset_at = now()
  WHERE last_reset_at < now() - interval '1 minute';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;