-- CRITICAL SECURITY FIX: Enable RLS on sensitive tables

-- 1. telegram_config - Protect bot token exposure
ALTER TABLE telegram_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access" ON telegram_config;
DROP POLICY IF EXISTS "Enable read access for all users" ON telegram_config;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON telegram_config;
DROP POLICY IF EXISTS "Enable update for users based on email" ON telegram_config;
CREATE POLICY "Service role only - telegram_config" ON telegram_config FOR ALL USING (false) WITH CHECK (false);

-- 2. credential_vault - Protect encrypted credentials
ALTER TABLE credential_vault ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access" ON credential_vault;
CREATE POLICY "Service role only - credential_vault" ON credential_vault FOR ALL USING (false) WITH CHECK (false);

-- 3. exchange_connections - Protect API keys
ALTER TABLE exchange_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access" ON exchange_connections;
CREATE POLICY "Service role only - exchange_connections" ON exchange_connections FOR ALL USING (false) WITH CHECK (false);

-- 4. hft_ssh_keys - Protect SSH private keys
ALTER TABLE hft_ssh_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access" ON hft_ssh_keys;
CREATE POLICY "Service role only - hft_ssh_keys" ON hft_ssh_keys FOR ALL USING (false) WITH CHECK (false);

-- 5. system_secrets - Protect secrets
ALTER TABLE system_secrets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access" ON system_secrets;
CREATE POLICY "Service role only - system_secrets" ON system_secrets FOR ALL USING (false) WITH CHECK (false);

-- 6. cloud_credentials - Protect cloud API keys
ALTER TABLE cloud_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access" ON cloud_credentials;
CREATE POLICY "Service role only - cloud_credentials" ON cloud_credentials FOR ALL USING (false) WITH CHECK (false);

-- 7. master_password - Protect password hash
ALTER TABLE master_password ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access" ON master_password;
CREATE POLICY "Service role only - master_password" ON master_password FOR ALL USING (false) WITH CHECK (false);

-- 8. vps_instances - Protect SSH keys stored in instances
ALTER TABLE vps_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access" ON vps_instances;
CREATE POLICY "Service role only - vps_instances" ON vps_instances FOR ALL USING (false) WITH CHECK (false);

-- Add sync trigger for hft_deployments -> vps_instances status sync
CREATE OR REPLACE FUNCTION sync_hft_to_vps()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE vps_instances
  SET bot_status = NEW.bot_status,
      status = NEW.status,
      updated_at = NOW()
  WHERE deployment_id = NEW.server_id 
     OR provider_instance_id = NEW.server_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS sync_hft_bot_status ON hft_deployments;
CREATE TRIGGER sync_hft_bot_status
AFTER UPDATE ON hft_deployments
FOR EACH ROW
WHEN (OLD.bot_status IS DISTINCT FROM NEW.bot_status OR OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION sync_hft_to_vps();