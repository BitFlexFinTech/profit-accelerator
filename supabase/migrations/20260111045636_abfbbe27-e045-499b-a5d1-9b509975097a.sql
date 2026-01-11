-- Add service-role-only policies for critical tables
-- These ensure only edge functions (with service role) can access sensitive data

-- exchange_connections - service role only
CREATE POLICY "exchange_connections_service_only" 
ON exchange_connections FOR ALL 
USING (is_service_role()) 
WITH CHECK (is_service_role());

-- telegram_config - service role only  
CREATE POLICY "telegram_config_service_only"
ON telegram_config FOR ALL
USING (is_service_role())
WITH CHECK (is_service_role());

-- master_password - service role only
CREATE POLICY "master_password_service_only"
ON master_password FOR ALL
USING (is_service_role())
WITH CHECK (is_service_role());

-- credential_vault - service role only
CREATE POLICY "credential_vault_service_only"
ON credential_vault FOR ALL
USING (is_service_role())
WITH CHECK (is_service_role());

-- cloud_credentials - service role only
CREATE POLICY "cloud_credentials_service_only"
ON cloud_credentials FOR ALL
USING (is_service_role())
WITH CHECK (is_service_role());

-- system_secrets - service role only
CREATE POLICY "system_secrets_service_only"
ON system_secrets FOR ALL
USING (is_service_role())
WITH CHECK (is_service_role());

-- hft_ssh_keys - service role only
CREATE POLICY "hft_ssh_keys_service_only"
ON hft_ssh_keys FOR ALL
USING (is_service_role())
WITH CHECK (is_service_role());

-- trading_config - service role only
CREATE POLICY "trading_config_service_only"
ON trading_config FOR ALL
USING (is_service_role())
WITH CHECK (is_service_role());

-- trading_journal - service role only
CREATE POLICY "trading_journal_service_only"
ON trading_journal FOR ALL
USING (is_service_role())
WITH CHECK (is_service_role());

-- ai_config - service role only
CREATE POLICY "ai_config_service_only"
ON ai_config FOR ALL
USING (is_service_role())
WITH CHECK (is_service_role());