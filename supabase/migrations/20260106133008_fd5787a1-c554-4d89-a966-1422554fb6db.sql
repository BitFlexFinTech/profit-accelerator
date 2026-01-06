-- Insert Vultr VPS configuration with correct IP
INSERT INTO vps_config (provider, region, instance_type, outbound_ip, status)
VALUES ('vultr', 'nrt', 'vhf-1c-1gb', '167.179.83.239', 'running')
ON CONFLICT (id) DO NOTHING;

-- Insert failover configuration with health check URL
INSERT INTO failover_config (provider, health_check_url, is_primary, is_enabled, priority)
VALUES ('vultr', 'http://167.179.83.239:8080/health', true, true, 1)
ON CONFLICT (id) DO NOTHING;

-- Update cloud_config to show running status
UPDATE cloud_config 
SET status = 'running', is_active = true, updated_at = now()
WHERE provider = 'vultr';