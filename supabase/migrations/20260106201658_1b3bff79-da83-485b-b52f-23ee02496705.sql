-- =============================================
-- SYSTEM RESET: Complete Vultr Data Purge
-- =============================================

-- 1. Delete all Vultr entries from vps_config
DELETE FROM vps_config WHERE provider = 'vultr';

-- 2. Reset cloud_config for Vultr
UPDATE cloud_config 
SET is_active = false, 
    status = 'not_configured',
    credentials = NULL
WHERE provider = 'vultr';

-- 3. Delete Vultr failover configuration
DELETE FROM failover_config WHERE provider = 'vultr';

-- 4. Reset trading state to stopped/neutral
UPDATE trading_config
SET 
  bot_status = 'stopped',
  trading_enabled = false,
  updated_at = now();

-- 5. Ensure DigitalOcean and AWS are ready for fresh setup
UPDATE cloud_config 
SET status = 'not_configured',
    is_active = false,
    credentials = NULL
WHERE provider IN ('digitalocean', 'aws');