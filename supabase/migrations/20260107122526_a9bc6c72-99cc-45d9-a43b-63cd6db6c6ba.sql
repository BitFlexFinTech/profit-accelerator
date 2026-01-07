-- Phase 1: Database Schema Enhancement for Tokyo Mesh

-- Add columns to failover_config for multi-provider mesh
ALTER TABLE failover_config ADD COLUMN IF NOT EXISTS region TEXT DEFAULT 'ap-northeast-1';
ALTER TABLE failover_config ADD COLUMN IF NOT EXISTS latency_ms INTEGER DEFAULT 0;
ALTER TABLE failover_config ADD COLUMN IF NOT EXISTS last_health_check TIMESTAMPTZ;
ALTER TABLE failover_config ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0;
ALTER TABLE failover_config ADD COLUMN IF NOT EXISTS auto_failover_enabled BOOLEAN DEFAULT true;

-- Enable realtime for mesh sync (REPLICA IDENTITY FULL for complete row data)
ALTER TABLE vps_config REPLICA IDENTITY FULL;
ALTER TABLE failover_config REPLICA IDENTITY FULL;
ALTER TABLE vps_metrics REPLICA IDENTITY FULL;

-- Add unique constraint on provider for upsert capability
ALTER TABLE failover_config ADD CONSTRAINT failover_config_provider_unique UNIQUE (provider);
ALTER TABLE cloud_config ADD CONSTRAINT cloud_config_provider_unique UNIQUE (provider);

-- Seed 8 Cloud Providers with Tokyo Focus
INSERT INTO failover_config (provider, priority, is_primary, is_enabled, region, health_check_url, auto_failover_enabled)
VALUES 
  ('contabo', 1, true, true, 'singapore', NULL, true),
  ('vultr', 2, false, true, 'nrt', NULL, true),
  ('aws', 3, false, true, 'ap-northeast-1', NULL, true),
  ('digitalocean', 4, false, true, 'sgp1', NULL, true),
  ('gcp', 5, false, true, 'asia-northeast1', NULL, true),
  ('oracle', 6, false, true, 'ap-tokyo-1', NULL, true),
  ('alibaba', 7, false, true, 'ap-northeast-1', NULL, true),
  ('azure', 8, false, true, 'japaneast', NULL, true)
ON CONFLICT (provider) DO UPDATE SET
  region = EXCLUDED.region,
  priority = EXCLUDED.priority,
  auto_failover_enabled = EXCLUDED.auto_failover_enabled;

-- Seed cloud_config for all 8 providers
INSERT INTO cloud_config (provider, region, instance_type, use_free_tier, status)
VALUES 
  ('contabo', 'singapore', 'VPS S', false, 'not_configured'),
  ('vultr', 'nrt', 'vhf-1c-1gb', true, 'not_configured'),
  ('aws', 'ap-northeast-1', 't4g.micro', true, 'not_configured'),
  ('digitalocean', 'sgp1', 's-1vcpu-1gb', true, 'not_configured'),
  ('gcp', 'asia-northeast1', 'e2-micro', true, 'not_configured'),
  ('oracle', 'ap-tokyo-1', 'VM.Standard.A1.Flex', true, 'not_configured'),
  ('alibaba', 'ap-northeast-1', 'ecs.t6-c1m1.large', true, 'not_configured'),
  ('azure', 'japaneast', 'Standard_B1ls', true, 'not_configured')
ON CONFLICT (provider) DO UPDATE SET
  region = EXCLUDED.region,
  instance_type = EXCLUDED.instance_type;