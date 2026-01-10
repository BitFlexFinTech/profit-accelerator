-- One-time reset to correct bot status (VPS has no START_SIGNAL, so status should be stopped/standby)
UPDATE trading_config SET bot_status = 'stopped', trading_enabled = false, updated_at = NOW();
UPDATE hft_deployments SET bot_status = 'stopped', updated_at = NOW();
UPDATE vps_instances SET bot_status = 'stopped', updated_at = NOW() WHERE bot_status IS NOT NULL;