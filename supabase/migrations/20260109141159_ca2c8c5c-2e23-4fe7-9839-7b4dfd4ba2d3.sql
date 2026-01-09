-- Reset all AI providers for optimal performance
UPDATE ai_providers SET
  cooldown_until = NULL,
  error_count = 0,
  current_usage = 0,
  daily_usage = 0,
  last_error = NULL,
  last_reset_at = NOW(),
  last_daily_reset_at = NOW()
WHERE is_enabled = true;

-- Set optimal rate limits for each provider
UPDATE ai_providers SET rate_limit_rpm = 30 WHERE provider_name = 'groq';
UPDATE ai_providers SET rate_limit_rpm = 60 WHERE provider_name = 'cerebras';
UPDATE ai_providers SET rate_limit_rpm = 60 WHERE provider_name = 'together';
UPDATE ai_providers SET rate_limit_rpm = 20 WHERE provider_name = 'mistral';
UPDATE ai_providers SET rate_limit_rpm = 100 WHERE provider_name = 'openrouter';

-- Ensure all working providers are active
UPDATE ai_providers SET is_enabled = true, is_active = true, priority = 1 WHERE provider_name = 'openrouter';
UPDATE ai_providers SET is_enabled = true, is_active = true, priority = 2 WHERE provider_name = 'groq';
UPDATE ai_providers SET is_enabled = true, is_active = true, priority = 3 WHERE provider_name = 'cerebras';
UPDATE ai_providers SET is_enabled = true, is_active = true, priority = 4 WHERE provider_name = 'together';
UPDATE ai_providers SET is_enabled = true, is_active = true, priority = 5 WHERE provider_name = 'mistral';