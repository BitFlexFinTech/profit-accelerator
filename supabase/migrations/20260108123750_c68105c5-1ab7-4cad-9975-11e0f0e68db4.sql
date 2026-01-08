-- Insert HFT deployment record for the running Tokyo VPS
INSERT INTO hft_deployments (
  id, provider, server_id, server_name, ip_address, region, 
  server_plan, status, bot_status, created_at, updated_at
) VALUES (
  gen_random_uuid(), 
  'vultr', 
  'vultr-nrt-hft', 
  'Tokyo HFT Bot', 
  '107.191.61.107', 
  'nrt', 
  'vc2-1c-1gb', 
  'running', 
  'running',
  now(), 
  now()
)
ON CONFLICT DO NOTHING;

-- Insert VPS instance record linked to deployment
INSERT INTO vps_instances (
  id, provider, provider_instance_id, nickname, ip_address, region, 
  instance_size, status, bot_status, monthly_cost, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'vultr',
  'vultr-nrt-hft',
  'Tokyo HFT Bot',
  '107.191.61.107',
  'nrt',
  'vc2-1c-1gb',
  'running',
  'running',
  6.00,
  now(),
  now()
)
ON CONFLICT DO NOTHING;

-- Update trading_config to reflect running state
UPDATE trading_config 
SET bot_status = 'running', 
    trading_enabled = true, 
    updated_at = now()
WHERE id = (SELECT id FROM trading_config LIMIT 1);

-- Ensure vps_config has correct status
UPDATE vps_config 
SET status = 'running', 
    outbound_ip = '107.191.61.107',
    provider = 'vultr',
    updated_at = now()
WHERE id = (SELECT id FROM vps_config LIMIT 1);