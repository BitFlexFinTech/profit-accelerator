-- Link vps_instances to hft_deployments by matching IP address
UPDATE vps_instances 
SET deployment_id = (SELECT id::text FROM hft_deployments WHERE ip_address = '107.191.61.107' LIMIT 1)
WHERE ip_address = '107.191.61.107';