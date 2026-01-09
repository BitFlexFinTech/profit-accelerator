-- Phase 23: Complete Trading Data Reset
-- Clear all trading data so user starts fresh
-- Only user can initiate trades - no pre-populated data

-- Clear trading journal (all trade records)
TRUNCATE TABLE trading_journal;

-- Reset simulation progress to initial state
UPDATE simulation_progress 
SET 
  successful_simulation_trades = 0,
  successful_paper_trades = 0,
  simulation_profit_total = 0,
  paper_profit_total = 0,
  paper_mode_unlocked = false,
  live_mode_unlocked = false,
  simulation_completed = false,
  last_paper_trade_at = NULL,
  updated_at = NOW();

-- Clear paper trading tables
TRUNCATE TABLE paper_orders;
TRUNCATE TABLE paper_positions;
TRUNCATE TABLE paper_balance_history;

-- Clear orders table (live orders)
TRUNCATE TABLE orders;