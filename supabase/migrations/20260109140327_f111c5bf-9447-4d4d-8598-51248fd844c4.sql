-- Fix AI provider issues: disable problematic providers, reset Groq, enable backups

-- 1. Disable HuggingFace (403 permission errors)
UPDATE ai_providers SET
  is_enabled = false,
  last_error = 'Disabled: 403 permission error - needs API key reconfiguration'
WHERE provider_name = 'huggingface';

-- 2. Reset Groq completely and reduce rate limit buffer
UPDATE ai_providers SET
  cooldown_until = NULL,
  error_count = 0,
  current_usage = 0,
  daily_usage = 0,
  last_error = NULL,
  rate_limit_rpm = 25  -- Slightly reduced from 30 for safety margin
WHERE provider_name = 'groq';

-- 3. Enable and prioritize backup providers
UPDATE ai_providers SET
  is_enabled = true,
  is_active = true,
  priority = 2,
  error_count = 0,
  cooldown_until = NULL
WHERE provider_name = 'together';

UPDATE ai_providers SET
  is_enabled = true,
  is_active = true,
  priority = 3,
  error_count = 0,
  cooldown_until = NULL
WHERE provider_name = 'cerebras';

-- 4. Reset all other enabled providers
UPDATE ai_providers SET
  error_count = 0,
  cooldown_until = NULL,
  current_usage = 0
WHERE is_enabled = true;