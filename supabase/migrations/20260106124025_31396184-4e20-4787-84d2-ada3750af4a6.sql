-- Full VPS Configuration Reset
-- Clear Vultr and AWS entries from vps_config
DELETE FROM vps_config WHERE provider IN ('vultr', 'aws');

-- Reset cloud_config vultr entry to not_configured
UPDATE cloud_config 
SET status = 'not_configured', is_active = false, credentials = null
WHERE provider = 'vultr';

-- Clear failover config for vultr
DELETE FROM failover_config WHERE provider = 'vultr';

-- Clear any stale VPS metrics for vultr
DELETE FROM vps_metrics WHERE provider = 'vultr';