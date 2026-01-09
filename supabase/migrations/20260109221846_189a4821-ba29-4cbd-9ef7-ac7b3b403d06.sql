-- Phase 2: Optimize AI providers - disable OpenRouter (at 99% limit with errors), promote Groq

-- Disable OpenRouter temporarily due to rate limit exhaustion and 939 errors
UPDATE ai_providers 
SET is_active = false, 
    priority = 99,
    last_error = 'Disabled due to daily limit exhaustion (4950/5000) and high error count (939)'
WHERE provider_name = 'openrouter';

-- Promote Groq to priority 1 (14,400 RPD capacity, only 546 used)
UPDATE ai_providers 
SET priority = 1
WHERE provider_name = 'groq';

-- Promote Cerebras to priority 2
UPDATE ai_providers 
SET priority = 2
WHERE provider_name = 'cerebras';

-- Promote Together to priority 3
UPDATE ai_providers 
SET priority = 3
WHERE provider_name = 'together';

-- Set Mistral to priority 4
UPDATE ai_providers 
SET priority = 4
WHERE provider_name = 'mistral';

-- Enable Gemini as backup (priority 5)
UPDATE ai_providers 
SET is_active = true,
    priority = 5
WHERE provider_name = 'gemini';