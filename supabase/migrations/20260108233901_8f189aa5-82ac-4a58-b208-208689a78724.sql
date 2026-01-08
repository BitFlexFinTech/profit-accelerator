-- Reset Groq stuck usage
UPDATE ai_providers 
SET current_usage = 0, daily_usage = 0, last_reset_at = NOW(), last_daily_reset_at = NOW()
WHERE provider_name = 'groq';

-- Set providers with secrets to active
UPDATE ai_providers 
SET has_secret = true, is_active = true, is_enabled = true
WHERE provider_name IN ('groq', 'cerebras', 'openrouter', 'mistral');

-- Disable providers without keys (Together, Gemini - will add later)
UPDATE ai_providers 
SET has_secret = false, is_active = false, is_enabled = false 
WHERE provider_name IN ('together', 'gemini');