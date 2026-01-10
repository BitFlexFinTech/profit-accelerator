-- Fix trading_config default from 'idle' to 'stopped' for consistency
ALTER TABLE trading_config 
  ALTER COLUMN bot_status SET DEFAULT 'stopped';

-- Update existing record if bot is idle and trading is disabled
UPDATE trading_config 
SET bot_status = 'stopped' 
WHERE bot_status = 'idle' 
  AND trading_enabled = false;