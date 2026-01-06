-- 1. Delete DigitalOcean VPS config
DELETE FROM vps_config WHERE provider = 'digitalocean' OR outbound_ip = '159.65.138.188';

-- 2. Reset DigitalOcean cloud config
UPDATE cloud_config 
SET status = 'not_configured', is_active = false 
WHERE provider = 'digitalocean';

-- 3. Stop trading and clear errors
UPDATE trading_config 
SET bot_status = 'stopped', 
    trading_enabled = false,
    updated_at = now();