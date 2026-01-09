-- Reset AI provider usage counters for fresh rotation
UPDATE ai_providers 
SET current_usage = 0, daily_usage = 0, cooldown_until = NULL, last_reset_at = NOW()
WHERE provider_name IN ('openrouter', 'mistral', 'cerebras', 'groq');

-- Add paper_trade column to trading_journal if not exists
ALTER TABLE trading_journal 
ADD COLUMN IF NOT EXISTS paper_trade BOOLEAN DEFAULT false;