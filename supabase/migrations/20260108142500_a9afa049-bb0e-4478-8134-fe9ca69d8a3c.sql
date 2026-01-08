-- Add Profit Piranha strategy (simple insert)
INSERT INTO trading_strategies (
  name, 
  description, 
  is_active, 
  is_paused, 
  win_rate, 
  trades_today, 
  pnl_today, 
  trading_mode, 
  leverage
) VALUES (
  'Profit Piranha',
  'Aggressive scalping strategy targeting $1-3 profit per trade with quick entries and exits',
  false,
  true,
  0,
  0,
  0,
  'spot',
  1
);