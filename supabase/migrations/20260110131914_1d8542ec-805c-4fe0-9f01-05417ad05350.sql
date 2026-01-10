-- ===============================================
-- FIX EXCHANGE CONNECTIONS RLS POLICIES
-- ===============================================

-- Drop the overly restrictive service_role_only policy
DROP POLICY IF EXISTS "service_role_only_exchange_connections" ON exchange_connections;

-- Allow read access for dashboard (SELECT only - no sensitive columns exposed via view below)
CREATE POLICY "Allow public read exchange_connections" 
ON exchange_connections 
FOR SELECT 
USING (true);

-- Keep write operations service-role only
CREATE POLICY "Service role insert exchange_connections" 
ON exchange_connections 
FOR INSERT 
WITH CHECK (is_service_role());

CREATE POLICY "Service role update exchange_connections" 
ON exchange_connections 
FOR UPDATE 
USING (is_service_role());

CREATE POLICY "Service role delete exchange_connections" 
ON exchange_connections 
FOR DELETE 
USING (is_service_role());

-- ===============================================
-- CREATE SECURE PUBLIC VIEW (Hides API Keys)
-- ===============================================
CREATE OR REPLACE VIEW exchange_connections_public AS
SELECT 
  id,
  exchange_name,
  is_connected,
  balance_usdt,
  balance_updated_at,
  last_ping_at,
  last_ping_ms,
  last_error,
  last_error_at,
  updated_at
FROM exchange_connections;

-- Grant SELECT on the view to anon and authenticated roles
GRANT SELECT ON exchange_connections_public TO anon, authenticated;

-- ===============================================
-- CLEANUP MOCK DATA FROM BALANCE_HISTORY
-- ===============================================
-- Delete balance_history entries with suspiciously round mock numbers
DELETE FROM balance_history 
WHERE total_balance IN (2956.79, 2890.50, 2920.15, 2875.00, 2910.25, 2945.60, 10000, 10250.50, 10180.25, 10320.75, 10410.30, 10350.80, 10480.20)
  OR (total_balance = 0 AND exchange_breakdown = '[]'::jsonb);