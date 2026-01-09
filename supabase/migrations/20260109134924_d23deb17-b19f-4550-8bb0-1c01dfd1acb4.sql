-- Force complete reset of problematic providers
UPDATE ai_providers SET
  error_count = 0,
  last_error = NULL,
  current_usage = 0,
  cooldown_until = NULL
WHERE provider_name IN ('huggingface', 'groq');