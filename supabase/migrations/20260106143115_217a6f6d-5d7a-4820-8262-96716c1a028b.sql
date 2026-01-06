-- Fix VPS configuration with correct Tokyo IP
UPDATE vps_config 
SET 
  outbound_ip = '167.179.83.239',
  status = 'idle',
  region = 'nrt',
  provider = 'vultr',
  instance_type = 'vhf-1c-1gb',
  updated_at = now()
WHERE provider = 'vultr' OR outbound_ip = '35.181.172.35';

-- Insert if no vultr config exists
INSERT INTO vps_config (provider, outbound_ip, status, region, instance_type)
SELECT 'vultr', '167.179.83.239', 'idle', 'nrt', 'vhf-1c-1gb'
WHERE NOT EXISTS (SELECT 1 FROM vps_config WHERE provider = 'vultr');