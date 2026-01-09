-- Phase 16: Reset AI Provider Rate Limits + Add HuggingFace Provider

-- A: Reset all AI provider daily usage counters and cooldowns
UPDATE ai_providers
SET 
  daily_usage = 0,
  current_usage = 0,
  cooldown_until = NULL,
  last_daily_reset_at = NOW(),
  error_count = 0
WHERE provider_name IS NOT NULL;

-- B: Add HuggingFace as a free AI provider
INSERT INTO ai_providers (
  provider_name, display_name, short_name, 
  api_endpoint, model_name,
  rate_limit_rpm, rate_limit_rpd, priority, 
  color_hex, color_class, border_class,
  is_enabled, has_secret, 
  secret_name, api_key_field,
  get_key_url, free_tier_info
)
VALUES (
  'huggingface', 'Hugging Face (Free)', 'HF',
  'https://api-inference.huggingface.co/v1/chat/completions',
  'meta-llama/Llama-3.1-8B-Instruct',
  30, 1000, 95,
  '#FFD21E', 'bg-yellow-500/20', 'border-yellow-500',
  false, false,
  'HUGGINGFACE_API_KEY', 'apiKey',
  'https://huggingface.co/settings/tokens',
  'Free tier with 1000 requests/day'
)
ON CONFLICT (provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  short_name = EXCLUDED.short_name,
  api_endpoint = EXCLUDED.api_endpoint,
  model_name = EXCLUDED.model_name,
  rate_limit_rpm = EXCLUDED.rate_limit_rpm,
  rate_limit_rpd = EXCLUDED.rate_limit_rpd,
  priority = EXCLUDED.priority,
  color_hex = EXCLUDED.color_hex,
  free_tier_info = EXCLUDED.free_tier_info;