-- 1. Insert the DigitalOcean VPS into vps_config
INSERT INTO vps_config (provider, outbound_ip, region, status, instance_type)
VALUES ('digitalocean', '159.65.138.188', 'sgp1', 'running', 's-1vcpu-1gb')
ON CONFLICT (id) DO NOTHING;

-- 2. Update cloud_config status to active for digitalocean
UPDATE cloud_config
SET status = 'active',
    is_active = true,
    updated_at = now()
WHERE provider = 'digitalocean';

-- 3. Set trading_config to running (update existing or insert)
UPDATE trading_config
SET bot_status = 'running',
    trading_enabled = true,
    updated_at = now()
WHERE id = (SELECT id FROM trading_config LIMIT 1);

-- If no trading_config exists, insert one
INSERT INTO trading_config (bot_status, trading_enabled)
SELECT 'running', true
WHERE NOT EXISTS (SELECT 1 FROM trading_config);