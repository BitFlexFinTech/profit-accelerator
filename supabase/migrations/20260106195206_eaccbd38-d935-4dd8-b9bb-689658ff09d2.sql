-- Phase 1: Force correct VPS IP and status
UPDATE vps_config 
SET 
  outbound_ip = '167.179.83.239',
  status = 'running',
  updated_at = now()
WHERE provider = 'vultr';

-- Activate trading bot
UPDATE trading_config
SET 
  bot_status = 'running',
  trading_enabled = true,
  updated_at = now();