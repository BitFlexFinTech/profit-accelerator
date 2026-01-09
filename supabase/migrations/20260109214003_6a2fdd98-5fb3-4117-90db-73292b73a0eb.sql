-- EMERGENCY SECURITY FIX: Drop all permissive RLS policies and create secure service-role-only policies

-- 1. Drop ALL existing permissive policies on sensitive tables
DROP POLICY IF EXISTS "Allow full access exchange_connections" ON exchange_connections;
DROP POLICY IF EXISTS "Service role only - exchange_connections" ON exchange_connections;
DROP POLICY IF EXISTS "Allow all operations on exchange_connections" ON exchange_connections;
DROP POLICY IF EXISTS "exchange_connections_policy" ON exchange_connections;

DROP POLICY IF EXISTS "Allow all access to cloud_credentials" ON cloud_credentials;
DROP POLICY IF EXISTS "Service role only - cloud_credentials" ON cloud_credentials;
DROP POLICY IF EXISTS "Allow all operations on cloud_credentials" ON cloud_credentials;
DROP POLICY IF EXISTS "cloud_credentials_policy" ON cloud_credentials;

DROP POLICY IF EXISTS "Allow anonymous access to credential_vault" ON credential_vault;
DROP POLICY IF EXISTS "Service role only - credential_vault" ON credential_vault;
DROP POLICY IF EXISTS "Allow all operations on credential_vault" ON credential_vault;
DROP POLICY IF EXISTS "credential_vault_policy" ON credential_vault;

DROP POLICY IF EXISTS "Public access hft_ssh_keys" ON hft_ssh_keys;
DROP POLICY IF EXISTS "Service role only - hft_ssh_keys" ON hft_ssh_keys;
DROP POLICY IF EXISTS "Allow all operations on hft_ssh_keys" ON hft_ssh_keys;
DROP POLICY IF EXISTS "hft_ssh_keys_policy" ON hft_ssh_keys;

DROP POLICY IF EXISTS "ai_trade_decisions_all" ON ai_trade_decisions;
DROP POLICY IF EXISTS "Allow all operations on ai_trade_decisions" ON ai_trade_decisions;
DROP POLICY IF EXISTS "ai_trade_decisions_policy" ON ai_trade_decisions;

-- 2. Create security definer function to check service role
CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role',
    false
  )
$$;

-- 3. Create secure service-role-only policies for sensitive tables

-- exchange_connections: Contains API keys - CRITICAL
CREATE POLICY "service_role_only_exchange_connections" 
ON exchange_connections 
FOR ALL 
USING (public.is_service_role())
WITH CHECK (public.is_service_role());

-- cloud_credentials: Contains cloud provider credentials - CRITICAL
CREATE POLICY "service_role_only_cloud_credentials" 
ON cloud_credentials 
FOR ALL 
USING (public.is_service_role())
WITH CHECK (public.is_service_role());

-- credential_vault: Contains encrypted credentials - CRITICAL
CREATE POLICY "service_role_only_credential_vault" 
ON credential_vault 
FOR ALL 
USING (public.is_service_role())
WITH CHECK (public.is_service_role());

-- hft_ssh_keys: Contains SSH private keys - CRITICAL
CREATE POLICY "service_role_only_hft_ssh_keys" 
ON hft_ssh_keys 
FOR ALL 
USING (public.is_service_role())
WITH CHECK (public.is_service_role());

-- ai_trade_decisions: Contains trading signals - SENSITIVE
CREATE POLICY "service_role_only_ai_trade_decisions" 
ON ai_trade_decisions 
FOR ALL 
USING (public.is_service_role())
WITH CHECK (public.is_service_role());