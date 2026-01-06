-- Activate VPS status to running for Tokyo server
UPDATE vps_config 
SET status = 'running', updated_at = now()
WHERE outbound_ip = '167.179.83.239';

-- Activate trading bot
UPDATE trading_config
SET 
  bot_status = 'running',
  trading_enabled = true,
  updated_at = now();