-- Update failover_config to use port 80 instead of 8080 for health checks
UPDATE failover_config 
SET health_check_url = 'http://107.191.61.107/health'
WHERE provider = 'vultr';