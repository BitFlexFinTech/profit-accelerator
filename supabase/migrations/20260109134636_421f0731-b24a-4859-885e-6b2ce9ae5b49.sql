-- Force reset ALL AI providers to clean state
UPDATE ai_providers SET
  error_count = 0,
  last_error = NULL,
  current_usage = 0,
  daily_usage = 0,
  cooldown_until = NULL,
  last_daily_reset_at = NOW(),
  last_reset_at = NOW()
WHERE provider_name IN ('huggingface', 'groq', 'mistral', 'openrouter', 'cerebras', 'together', 'gemini');