-- Clear all AI provider cooldowns and error counts to restore full rotation
UPDATE ai_providers 
SET 
  cooldown_until = NULL, 
  error_count = 0,
  current_usage = 0,
  last_error = NULL
WHERE cooldown_until IS NOT NULL 
   OR error_count > 0 
   OR current_usage > 0;