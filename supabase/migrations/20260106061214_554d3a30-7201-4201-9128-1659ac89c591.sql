-- Update vps_config with correct Vultr server IP
UPDATE vps_config 
SET 
  outbound_ip = '167.179.83.239',
  status = 'running',
  provider = 'vultr',
  updated_at = NOW()
WHERE provider = 'vultr';

-- Insert if not exists
INSERT INTO vps_config (provider, outbound_ip, status, region)
SELECT 'vultr', '167.179.83.239', 'running', 'ap-northeast-1'
WHERE NOT EXISTS (SELECT 1 FROM vps_config WHERE provider = 'vultr');

-- Update cloud_config status
UPDATE cloud_config 
SET 
  status = 'running',
  is_active = true,
  updated_at = NOW()
WHERE provider = 'vultr';

-- Add to failover_config as primary server
INSERT INTO failover_config (
  provider,
  priority,
  is_primary,
  is_enabled,
  health_check_url,
  timeout_ms
) VALUES (
  'vultr',
  1,
  true,
  true,
  'http://167.179.83.239:8080/health',
  5000
)
ON CONFLICT DO NOTHING;