UPDATE vps_config 
SET outbound_ip = '167.179.83.239', status = 'running', updated_at = NOW()
WHERE provider = 'vultr';