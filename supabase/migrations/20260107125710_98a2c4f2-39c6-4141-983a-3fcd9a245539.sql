-- TOKYO HFT COMMAND CENTER - Nuclear Wipe for Production Reset
-- This migration clears stale VPS data and resets cloud infrastructure for clean start

-- Clear stale VPS data
TRUNCATE TABLE vps_config;
TRUNCATE TABLE vps_metrics;
TRUNCATE TABLE failover_events;

-- Clear scheduled health check results (keep others)
DELETE FROM health_check_results WHERE check_type = 'scheduled';

-- Reset cloud_config to fresh state
UPDATE cloud_config SET 
  status = 'not_configured', 
  credentials = NULL, 
  is_active = false,
  updated_at = now();

-- Reset all failover configs
UPDATE failover_config SET 
  latency_ms = 0, 
  consecutive_failures = 0, 
  last_health_check = NULL,
  is_primary = false,
  updated_at = now();

-- Set Contabo as initial primary (if exists)
UPDATE failover_config SET is_primary = true WHERE provider = 'contabo';

-- Insert default failover configs for all 8 providers if they don't exist
INSERT INTO failover_config (provider, priority, is_primary, is_enabled, region, auto_failover_enabled)
VALUES 
  ('contabo', 1, true, true, 'singapore', true),
  ('vultr', 2, false, true, 'tokyo', true),
  ('aws', 3, false, true, 'ap-northeast-1', true),
  ('digitalocean', 4, false, true, 'sgp1', true),
  ('gcp', 5, false, true, 'asia-northeast1', true),
  ('oracle', 6, false, true, 'ap-tokyo-1', true),
  ('alibaba', 7, false, true, 'ap-northeast-1', true),
  ('azure', 8, false, true, 'japaneast', true)
ON CONFLICT (provider) DO UPDATE SET
  priority = EXCLUDED.priority,
  region = EXCLUDED.region,
  auto_failover_enabled = EXCLUDED.auto_failover_enabled,
  updated_at = now();