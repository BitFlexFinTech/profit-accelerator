-- Insert Profit Piranha strategy into trading_strategies if not exists
INSERT INTO public.trading_strategies (
  name, 
  description, 
  is_active, 
  is_paused,
  trading_mode,
  leverage,
  position_size,
  profit_target,
  daily_goal,
  daily_progress,
  win_rate,
  trades_today,
  pnl_today,
  source_framework
)
SELECT 
  'Profit Piranha',
  'Default HFT scalping strategy - quick in/out trades targeting small consistent profits',
  false,
  false,
  'spot',
  1,
  100,
  0.5,
  50,
  0,
  0,
  0,
  0,
  null
WHERE NOT EXISTS (
  SELECT 1 FROM public.trading_strategies WHERE name = 'Profit Piranha'
);

-- Also ensure strategy_config has Piranha
INSERT INTO public.strategy_config (
  strategy_name,
  display_name,
  is_enabled,
  use_leverage,
  leverage_multiplier,
  min_position_size,
  max_position_size,
  profit_target_spot,
  profit_target_leverage,
  trade_both_directions
)
SELECT
  'profit_piranha',
  'Profit Piranha',
  false,
  false,
  1,
  50,
  1000,
  0.5,
  1.0,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public.strategy_config WHERE strategy_name = 'profit_piranha'
);