-- =====================================================
-- PHASE 1: Fix Security Definer Views
-- Convert to INVOKER views (RLS-respecting)
-- =====================================================

-- Drop and recreate exchange_connections_public with security_invoker
DROP VIEW IF EXISTS exchange_connections_public;

CREATE VIEW exchange_connections_public 
WITH (security_invoker = true) AS
SELECT 
  id, 
  exchange_name, 
  is_connected, 
  balance_usdt, 
  balance_updated_at, 
  last_ping_at, 
  last_ping_ms, 
  last_error, 
  last_error_at
FROM exchange_connections;

-- Grant access to the view
GRANT SELECT ON exchange_connections_public TO anon, authenticated;

-- =====================================================
-- PHASE 2: Fix AI Providers RLS
-- Keep SELECT public, restrict writes to service_role
-- =====================================================

-- Drop overly permissive policy
DROP POLICY IF EXISTS "Enable read access for all users" ON ai_providers;
DROP POLICY IF EXISTS "ai_providers_all" ON ai_providers;
DROP POLICY IF EXISTS "ai_providers_select" ON ai_providers;
DROP POLICY IF EXISTS "ai_providers_insert" ON ai_providers;
DROP POLICY IF EXISTS "ai_providers_update" ON ai_providers;
DROP POLICY IF EXISTS "ai_providers_delete" ON ai_providers;

-- Create proper policies
CREATE POLICY "ai_providers_select" ON ai_providers FOR SELECT USING (true);
CREATE POLICY "ai_providers_insert" ON ai_providers FOR INSERT WITH CHECK (is_service_role());
CREATE POLICY "ai_providers_update" ON ai_providers FOR UPDATE USING (is_service_role());
CREATE POLICY "ai_providers_delete" ON ai_providers FOR DELETE USING (is_service_role());

-- =====================================================
-- PHASE 3: Fix VPS Config RLS
-- =====================================================

DROP POLICY IF EXISTS "Allow full access vps_config" ON vps_config;
DROP POLICY IF EXISTS "vps_config_select" ON vps_config;
DROP POLICY IF EXISTS "vps_config_write" ON vps_config;
DROP POLICY IF EXISTS "vps_config_update" ON vps_config;
DROP POLICY IF EXISTS "vps_config_delete" ON vps_config;

CREATE POLICY "vps_config_select" ON vps_config FOR SELECT USING (true);
CREATE POLICY "vps_config_insert" ON vps_config FOR INSERT WITH CHECK (is_service_role());
CREATE POLICY "vps_config_update" ON vps_config FOR UPDATE USING (is_service_role());
CREATE POLICY "vps_config_delete" ON vps_config FOR DELETE USING (is_service_role());

-- =====================================================
-- PHASE 4: Fix VPS Instances RLS
-- Remove conflicting policies, consolidate
-- =====================================================

DROP POLICY IF EXISTS "Allow all access to vps_instances" ON vps_instances;
DROP POLICY IF EXISTS "Allow read access for VPS dashboard" ON vps_instances;
DROP POLICY IF EXISTS "Service role only - vps_instances" ON vps_instances;
DROP POLICY IF EXISTS "vps_instances_select" ON vps_instances;
DROP POLICY IF EXISTS "vps_instances_write" ON vps_instances;
DROP POLICY IF EXISTS "vps_instances_update" ON vps_instances;
DROP POLICY IF EXISTS "vps_instances_delete" ON vps_instances;

CREATE POLICY "vps_instances_select" ON vps_instances FOR SELECT USING (true);
CREATE POLICY "vps_instances_insert" ON vps_instances FOR INSERT WITH CHECK (is_service_role());
CREATE POLICY "vps_instances_update" ON vps_instances FOR UPDATE USING (is_service_role());
CREATE POLICY "vps_instances_delete" ON vps_instances FOR DELETE USING (is_service_role());

-- =====================================================
-- PHASE 5: Fix VPS Metrics RLS
-- =====================================================

DROP POLICY IF EXISTS "Allow full access vps_metrics" ON vps_metrics;
DROP POLICY IF EXISTS "vps_metrics_select" ON vps_metrics;
DROP POLICY IF EXISTS "vps_metrics_insert" ON vps_metrics;
DROP POLICY IF EXISTS "vps_metrics_update" ON vps_metrics;

CREATE POLICY "vps_metrics_select" ON vps_metrics FOR SELECT USING (true);
CREATE POLICY "vps_metrics_insert" ON vps_metrics FOR INSERT WITH CHECK (is_service_role());
CREATE POLICY "vps_metrics_update" ON vps_metrics FOR UPDATE USING (is_service_role());

-- =====================================================
-- PHASE 6: Fix Balance History RLS
-- =====================================================

DROP POLICY IF EXISTS "Allow full access balance_history" ON balance_history;
DROP POLICY IF EXISTS "balance_history_select" ON balance_history;
DROP POLICY IF EXISTS "balance_history_insert" ON balance_history;

CREATE POLICY "balance_history_select" ON balance_history FOR SELECT USING (true);
CREATE POLICY "balance_history_insert" ON balance_history FOR INSERT WITH CHECK (is_service_role());

-- =====================================================
-- PHASE 7: Fix Trading Journal RLS
-- =====================================================

DROP POLICY IF EXISTS "Allow anonymous access to trading_journal" ON trading_journal;
DROP POLICY IF EXISTS "trading_journal_select" ON trading_journal;
DROP POLICY IF EXISTS "trading_journal_write" ON trading_journal;
DROP POLICY IF EXISTS "trading_journal_update" ON trading_journal;
DROP POLICY IF EXISTS "trading_journal_insert" ON trading_journal;

CREATE POLICY "trading_journal_select" ON trading_journal FOR SELECT USING (true);
CREATE POLICY "trading_journal_insert" ON trading_journal FOR INSERT WITH CHECK (is_service_role());
CREATE POLICY "trading_journal_update" ON trading_journal FOR UPDATE USING (is_service_role());

-- =====================================================
-- PHASE 8: Fix Exchange Connections RLS
-- Keep existing SELECT policy, ensure writes are service_role only
-- =====================================================

DROP POLICY IF EXISTS "exchange_connections_select" ON exchange_connections;
DROP POLICY IF EXISTS "exchange_connections_insert" ON exchange_connections;
DROP POLICY IF EXISTS "exchange_connections_update" ON exchange_connections;
DROP POLICY IF EXISTS "exchange_connections_delete" ON exchange_connections;
DROP POLICY IF EXISTS "Allow full access to exchange_connections" ON exchange_connections;

CREATE POLICY "exchange_connections_select" ON exchange_connections FOR SELECT USING (true);
CREATE POLICY "exchange_connections_insert" ON exchange_connections FOR INSERT WITH CHECK (is_service_role());
CREATE POLICY "exchange_connections_update" ON exchange_connections FOR UPDATE USING (is_service_role());
CREATE POLICY "exchange_connections_delete" ON exchange_connections FOR DELETE USING (is_service_role());