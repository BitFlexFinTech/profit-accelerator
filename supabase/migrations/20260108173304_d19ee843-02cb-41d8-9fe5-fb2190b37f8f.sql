-- Add new columns to trading_strategies for enhanced controls
ALTER TABLE trading_strategies 
ADD COLUMN IF NOT EXISTS position_size DECIMAL DEFAULT 100,
ADD COLUMN IF NOT EXISTS profit_target DECIMAL DEFAULT 10,
ADD COLUMN IF NOT EXISTS daily_goal DECIMAL DEFAULT 50,
ADD COLUMN IF NOT EXISTS daily_progress DECIMAL DEFAULT 0;

-- Update existing strategies with default values
UPDATE trading_strategies SET 
  position_size = COALESCE(position_size, 100),
  profit_target = COALESCE(profit_target, 10),
  daily_goal = COALESCE(daily_goal, 50),
  daily_progress = COALESCE(daily_progress, 0);