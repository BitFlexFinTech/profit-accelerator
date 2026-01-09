-- Phase 7: Additional RLS Policy Hardening for sensitive config tables

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Allow anonymous access to alert_config" ON alert_config;
DROP POLICY IF EXISTS "Allow all operations on alert_config" ON alert_config;
DROP POLICY IF EXISTS "Allow anonymous access to backup_schedule" ON backup_schedule;
DROP POLICY IF EXISTS "Allow all operations on backup_schedule" ON backup_schedule;
DROP POLICY IF EXISTS "Allow all for bot_signals" ON bot_signals;
DROP POLICY IF EXISTS "Allow all operations on bot_signals" ON bot_signals;
DROP POLICY IF EXISTS "Allow full access cloud_config" ON cloud_config;
DROP POLICY IF EXISTS "Allow all operations on cloud_config" ON cloud_config;
DROP POLICY IF EXISTS "Allow anonymous access to failover_config" ON failover_config;
DROP POLICY IF EXISTS "Allow all operations on failover_config" ON failover_config;
DROP POLICY IF EXISTS "Allow anonymous access to failover_events" ON failover_events;
DROP POLICY IF EXISTS "Allow all operations on failover_events" ON failover_events;

-- Create secure service_role_only policies using the is_service_role() function
CREATE POLICY "service_role_only_alert_config" ON alert_config 
  FOR ALL USING (public.is_service_role());

CREATE POLICY "service_role_only_backup_schedule" ON backup_schedule 
  FOR ALL USING (public.is_service_role());

CREATE POLICY "service_role_only_bot_signals" ON bot_signals 
  FOR ALL USING (public.is_service_role());

CREATE POLICY "service_role_only_cloud_config" ON cloud_config 
  FOR ALL USING (public.is_service_role());

CREATE POLICY "service_role_only_failover_config" ON failover_config 
  FOR ALL USING (public.is_service_role());

CREATE POLICY "service_role_only_failover_events" ON failover_events 
  FOR ALL USING (public.is_service_role());