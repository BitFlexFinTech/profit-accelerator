-- Phase 20: Restore AI Provider Availability

-- Part A & B: Reset OpenRouter and increase daily limit
UPDATE ai_providers 
SET 
  daily_usage = 0, 
  current_usage = 0,
  rate_limit_rpd = 5000,
  last_daily_reset_at = NOW()
WHERE provider_name = 'openrouter';

-- Part C: Clear ALL provider cooldowns and errors (comprehensive reset)
UPDATE ai_providers 
SET 
  cooldown_until = NULL, 
  error_count = 0,
  current_usage = 0,
  last_error = NULL
WHERE 1=1;