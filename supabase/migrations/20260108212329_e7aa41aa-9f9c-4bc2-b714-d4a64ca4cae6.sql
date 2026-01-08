-- Add VPS token and balance polling configuration columns to vps_config
ALTER TABLE vps_config ADD COLUMN IF NOT EXISTS vps_token TEXT;
ALTER TABLE vps_config ADD COLUMN IF NOT EXISTS balance_poll_interval_ms INTEGER DEFAULT 2000;
ALTER TABLE vps_config ADD COLUMN IF NOT EXISTS last_balance_poll_at TIMESTAMPTZ;

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_vps_config_vps_token ON vps_config(vps_token);

-- Add comment for documentation
COMMENT ON COLUMN vps_config.vps_token IS 'Authentication token for VPS to post balance updates';
COMMENT ON COLUMN vps_config.balance_poll_interval_ms IS 'Balance polling interval in milliseconds (default 2000ms = 2 seconds)';
COMMENT ON COLUMN vps_config.last_balance_poll_at IS 'Timestamp of last successful balance poll from VPS';