-- Update Piranha strategy with correct profit targets and remove non-connected exchanges
UPDATE strategy_config SET
  profit_target_spot = 1.0,
  profit_target_leverage = 3.0,
  is_enabled = true,
  allowed_exchanges = ARRAY['binance', 'okx'],
  updated_at = NOW()
WHERE strategy_name = 'profit_piranha';

-- Reset AI provider usage for fair round-robin rotation
UPDATE ai_providers SET
  daily_usage = 0,
  current_usage = 0,
  last_used_at = NULL,
  cooldown_until = NULL,
  last_error = NULL
WHERE is_enabled = true;