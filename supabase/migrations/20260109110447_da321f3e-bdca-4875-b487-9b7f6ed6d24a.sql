-- Phase 17: Production Hardening - Reset AI Provider Limits and Enable HuggingFace

-- 1. Increase OpenRouter daily limit from 200 to 1000
UPDATE ai_providers 
SET rate_limit_rpd = 1000 
WHERE provider_name = 'openrouter';

-- 2. Reset ALL provider daily usage, clear cooldowns, reset minute usage
UPDATE ai_providers 
SET 
  daily_usage = 0,
  current_usage = 0,
  cooldown_until = NULL,
  error_count = 0,
  last_daily_reset_at = NOW()
WHERE provider_name IN ('groq', 'cerebras', 'openrouter', 'mistral', 'huggingface');

-- 3. Enable HuggingFace provider (user can add API key later via wizard)
UPDATE ai_providers 
SET is_enabled = true
WHERE provider_name = 'huggingface';