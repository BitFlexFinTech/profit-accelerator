-- Ensure all tables have correct defaults for bot status
-- New deployments should NEVER start automatically

-- Set default bot_status to 'stopped' for hft_deployments
ALTER TABLE hft_deployments 
  ALTER COLUMN bot_status SET DEFAULT 'stopped';

-- Set default bot_status to 'stopped' for vps_instances  
ALTER TABLE vps_instances 
  ALTER COLUMN bot_status SET DEFAULT 'stopped';

-- Ensure trading_config defaults to disabled for new rows
-- Also update existing row to ensure consistency
UPDATE trading_config 
SET trading_enabled = false, bot_status = 'stopped'
WHERE id = '00000000-0000-0000-0000-000000000001' 
  AND (trading_enabled = true OR bot_status NOT IN ('stopped', 'idle'));