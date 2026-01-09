-- Phase 21: Clear Expired Cooldowns + Reset Provider Availability

-- Clear any cooldowns that have already expired
UPDATE ai_providers 
SET cooldown_until = NULL, error_count = 0
WHERE cooldown_until IS NOT NULL 
  AND cooldown_until < NOW();

-- Ensure all providers with API keys are enabled and reset
UPDATE ai_providers 
SET 
  is_enabled = true,
  is_active = true,
  current_usage = 0,
  last_error = NULL
WHERE provider_name IN ('openrouter', 'groq', 'cerebras', 'mistral');