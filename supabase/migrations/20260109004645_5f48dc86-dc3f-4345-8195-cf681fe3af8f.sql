-- Add cooldown_until column to ai_providers for persistent rate limit tracking
ALTER TABLE ai_providers ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;

-- Reset daily usage for providers that are near or over their daily limits
UPDATE ai_providers 
SET daily_usage = 0, current_usage = 0, cooldown_until = NULL, last_error = NULL
WHERE daily_usage > rate_limit_rpd * 0.9 OR daily_usage >= rate_limit_rpd;