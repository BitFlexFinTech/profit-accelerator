-- Phase 1: Set simulation_progress to always unlocked (Live mode only)
UPDATE simulation_progress SET
  paper_mode_unlocked = true,
  live_mode_unlocked = true,
  simulation_completed = true,
  updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001';

-- Phase 2: Force trading_mode to 'live' in trading_config
UPDATE trading_config SET 
  trading_mode = 'live',
  updated_at = now()
WHERE id IS NOT NULL;