-- Fix critical RLS policies by dropping overly permissive ones
-- These policies expose sensitive data to anonymous users

-- Drop dangerous policies on exchange_connections (exposes API keys)
DROP POLICY IF EXISTS "Allow public read exchange_connections" ON exchange_connections;
DROP POLICY IF EXISTS "exchange_connections_select" ON exchange_connections;

-- Drop dangerous policies on telegram_config (exposes bot tokens)
DROP POLICY IF EXISTS "Allow full access telegram_config" ON telegram_config;

-- Drop dangerous policies on master_password (exposes password hash)
DROP POLICY IF EXISTS "Allow anon read master_password" ON master_password;
DROP POLICY IF EXISTS "Allow anon insert master_password" ON master_password;

-- Drop dangerous policies on credential_vault (exposes encrypted credentials)
DROP POLICY IF EXISTS "Allow full access credential_vault" ON credential_vault;

-- Drop dangerous policies on cloud_credentials
DROP POLICY IF EXISTS "Allow full access cloud_credentials" ON cloud_credentials;

-- Drop dangerous policies on system_secrets
DROP POLICY IF EXISTS "Allow full access system_secrets" ON system_secrets;

-- Drop dangerous policies on hft_ssh_keys
DROP POLICY IF EXISTS "Allow full access hft_ssh_keys" ON hft_ssh_keys;

-- Drop dangerous policies on trading data tables
DROP POLICY IF EXISTS "Allow full access trading_config" ON trading_config;
DROP POLICY IF EXISTS "Allow full access trading_journal" ON trading_journal;
DROP POLICY IF EXISTS "Allow full access ai_config" ON ai_config;