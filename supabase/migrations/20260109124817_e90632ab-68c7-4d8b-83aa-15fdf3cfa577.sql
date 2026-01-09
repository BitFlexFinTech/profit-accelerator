-- Reset simulation progress to clean initial state for testing
UPDATE simulation_progress 
SET 
  successful_simulation_trades = 0,
  successful_paper_trades = 0,
  simulation_completed = false,
  paper_mode_unlocked = false,
  live_mode_unlocked = false,
  simulation_profit_total = 0,
  paper_profit_total = 0,
  updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001';