-- Reset bot_status from 'error' to 'stopped' when VPS is actually healthy
UPDATE trading_config SET bot_status = 'stopped' WHERE bot_status = 'error';
UPDATE hft_deployments SET bot_status = 'stopped' WHERE bot_status = 'error';
UPDATE vps_instances SET bot_status = 'stopped' WHERE bot_status = 'error';