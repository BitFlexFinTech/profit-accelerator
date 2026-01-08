-- Add daily rate limit tracking columns to ai_providers
ALTER TABLE ai_providers 
ADD COLUMN IF NOT EXISTS rate_limit_rpd INTEGER DEFAULT 1000,
ADD COLUMN IF NOT EXISTS daily_usage INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_daily_reset_at TIMESTAMPTZ DEFAULT NOW();

-- Update with accurate free tier limits for each provider
UPDATE ai_providers SET rate_limit_rpd = 14400 WHERE provider_name = 'groq';
UPDATE ai_providers SET rate_limit_rpd = 720 WHERE provider_name = 'cerebras';
UPDATE ai_providers SET rate_limit_rpd = 1000 WHERE provider_name = 'together';
UPDATE ai_providers SET rate_limit_rpd = 200 WHERE provider_name = 'openrouter';
UPDATE ai_providers SET rate_limit_rpd = 1000 WHERE provider_name = 'mistral';
UPDATE ai_providers SET rate_limit_rpd = 1500 WHERE provider_name = 'gemini';

-- Add provider tracking to market updates
ALTER TABLE ai_market_updates 
ADD COLUMN IF NOT EXISTS ai_provider TEXT DEFAULT 'unknown';

-- Create function to reset daily usage at midnight UTC
CREATE OR REPLACE FUNCTION public.reset_ai_provider_daily_usage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ai_providers
  SET daily_usage = 0, last_daily_reset_at = NOW()
  WHERE last_daily_reset_at < CURRENT_DATE;
END;
$$;