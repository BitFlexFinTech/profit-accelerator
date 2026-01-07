-- NUCLEAR RESET: Wipe all VPS and cloud configuration data

-- 1. TRUNCATE vps_config (delete all rows)
TRUNCATE TABLE vps_config;

-- 2. TRUNCATE cloud_config (delete all rows)
TRUNCATE TABLE cloud_config;

-- 3. Reset trading_config to stopped state
UPDATE trading_config 
SET bot_status = 'stopped', 
    trading_enabled = false,
    updated_at = now();

-- 4. Clear health check error logs
DELETE FROM health_check_results WHERE status = 'error';