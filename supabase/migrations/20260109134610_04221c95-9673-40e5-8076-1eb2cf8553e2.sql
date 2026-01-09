-- Reset HuggingFace error count
UPDATE ai_providers SET
  error_count = 0,
  last_error = NULL,
  current_usage = 0
WHERE provider_name = 'huggingface';

-- Clear Groq cooldown
UPDATE ai_providers SET
  cooldown_until = NULL,
  error_count = 0,
  current_usage = 0
WHERE provider_name = 'groq';

-- Reset providers near daily capacity
UPDATE ai_providers SET
  daily_usage = 0,
  current_usage = 0,
  error_count = 0,
  cooldown_until = NULL,
  last_daily_reset_at = NOW()
WHERE provider_name IN ('mistral', 'openrouter', 'cerebras');

-- Ensure Together AI is fully enabled as backup
UPDATE ai_providers SET
  is_enabled = true,
  is_active = true,
  current_usage = 0,
  error_count = 0
WHERE provider_name = 'together';