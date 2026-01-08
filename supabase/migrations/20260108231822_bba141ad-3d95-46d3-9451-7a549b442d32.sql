-- Reset all stuck AI provider usage counters
UPDATE ai_providers 
SET current_usage = 0, 
    daily_usage = 0, 
    last_reset_at = NOW(),
    last_daily_reset_at = NOW(),
    error_count = 0,
    last_error = NULL;

-- Update the reset function to be more robust
CREATE OR REPLACE FUNCTION public.reset_ai_provider_usage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Reset minute-based usage for providers where last reset was > 1 minute ago
  UPDATE ai_providers 
  SET current_usage = 0, last_reset_at = NOW()
  WHERE last_reset_at < NOW() - interval '1 minute'
     OR last_reset_at IS NULL
     OR current_usage > rate_limit_rpm;
END;
$function$;

-- Ensure the daily reset function exists and works correctly
CREATE OR REPLACE FUNCTION public.reset_ai_provider_daily_usage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Reset daily usage for providers where last daily reset was before today (UTC)
  UPDATE ai_providers
  SET daily_usage = 0, last_daily_reset_at = NOW()
  WHERE last_daily_reset_at::date < CURRENT_DATE
     OR last_daily_reset_at IS NULL
     OR daily_usage > rate_limit_rpd;
END;
$function$;