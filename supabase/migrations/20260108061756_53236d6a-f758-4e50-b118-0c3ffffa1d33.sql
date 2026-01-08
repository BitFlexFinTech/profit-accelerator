-- Set Vultr as the primary since it's the running VPS
UPDATE failover_config 
SET is_primary = true 
WHERE provider = 'vultr';

-- Remove primary from Contabo
UPDATE failover_config 
SET is_primary = false 
WHERE provider = 'contabo';