-- Phase 1: Foundation Tables for Cloud Infrastructure + Security

-- VPS Metrics for real-time monitoring
CREATE TABLE public.vps_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  cpu_percent NUMERIC DEFAULT 0,
  ram_percent NUMERIC DEFAULT 0,
  disk_percent NUMERIC DEFAULT 0,
  network_in_mbps NUMERIC DEFAULT 0,
  network_out_mbps NUMERIC DEFAULT 0,
  latency_ms NUMERIC DEFAULT 0,
  uptime_seconds BIGINT DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

-- Failover configuration
CREATE TABLE public.failover_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority INTEGER NOT NULL DEFAULT 1,
  provider TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  is_enabled BOOLEAN DEFAULT true,
  health_check_url TEXT,
  timeout_ms INTEGER DEFAULT 5000,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Failover events log
CREATE TABLE public.failover_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_provider TEXT NOT NULL,
  to_provider TEXT NOT NULL,
  reason TEXT,
  triggered_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  is_automatic BOOLEAN DEFAULT true
);

-- VPS Backups
CREATE TABLE public.vps_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  snapshot_id TEXT,
  size_gb NUMERIC,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Backup schedule
CREATE TABLE public.backup_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  cron_expression TEXT DEFAULT '0 0 * * *',
  retention_days INTEGER DEFAULT 7,
  is_enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Alert configuration
CREATE TABLE public.alert_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  webhook_url TEXT,
  is_enabled BOOLEAN DEFAULT true,
  threshold_value NUMERIC,
  cooldown_minutes INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Alert history
CREATE TABLE public.alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  message TEXT,
  severity TEXT DEFAULT 'info',
  sent_at TIMESTAMPTZ DEFAULT now(),
  acknowledged_at TIMESTAMPTZ
);

-- Cost analysis
CREATE TABLE public.cost_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  analysis_date DATE NOT NULL DEFAULT CURRENT_DATE,
  uptime_hours NUMERIC DEFAULT 0,
  cpu_avg_percent NUMERIC DEFAULT 0,
  ram_avg_percent NUMERIC DEFAULT 0,
  network_gb_out NUMERIC DEFAULT 0,
  compute_cost NUMERIC DEFAULT 0,
  network_cost NUMERIC DEFAULT 0,
  storage_cost NUMERIC DEFAULT 0,
  total_cost NUMERIC DEFAULT 0,
  trades_executed INTEGER DEFAULT 0,
  avg_latency_ms NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cost recommendations
CREATE TABLE public.cost_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_type TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',
  current_provider TEXT,
  recommended_provider TEXT,
  current_monthly_cost NUMERIC,
  recommended_monthly_cost NUMERIC,
  savings_percent NUMERIC,
  reason TEXT,
  is_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Credential vault with encryption
CREATE TABLE public.credential_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  label TEXT,
  encrypted_data TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_version INTEGER DEFAULT 1,
  last_rotated_at TIMESTAMPTZ,
  rotation_reminder_days INTEGER DEFAULT 90,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Vault audit log
CREATE TABLE public.vault_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID REFERENCES public.credential_vault(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Credential permissions for security scoring
CREATE TABLE public.credential_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID REFERENCES public.credential_vault(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  detected_scopes TEXT[] DEFAULT '{}',
  required_scopes TEXT[] DEFAULT '{}',
  excess_scopes TEXT[] DEFAULT '{}',
  is_read_only BOOLEAN DEFAULT false,
  can_withdraw BOOLEAN DEFAULT false,
  can_trade BOOLEAN DEFAULT true,
  ip_restricted BOOLEAN DEFAULT false,
  has_expiry BOOLEAN DEFAULT false,
  expiry_date TIMESTAMPTZ,
  security_score INTEGER DEFAULT 50,
  risk_level TEXT DEFAULT 'medium',
  last_analyzed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Security scores history
CREATE TABLE public.security_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  overall_score INTEGER NOT NULL,
  exchange_score INTEGER,
  cloud_score INTEGER,
  integration_score INTEGER,
  recommendations TEXT[],
  analyzed_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.vps_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failover_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failover_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vps_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_scores ENABLE ROW LEVEL SECURITY;

-- Create policies for anonymous access (single-user system)
CREATE POLICY "Allow anonymous access to vps_metrics" ON public.vps_metrics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access to failover_config" ON public.failover_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access to failover_events" ON public.failover_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access to vps_backups" ON public.vps_backups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access to backup_schedule" ON public.backup_schedule FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access to alert_config" ON public.alert_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access to alert_history" ON public.alert_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access to cost_analysis" ON public.cost_analysis FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access to cost_recommendations" ON public.cost_recommendations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access to credential_vault" ON public.credential_vault FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access to vault_audit_log" ON public.vault_audit_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access to credential_permissions" ON public.credential_permissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access to security_scores" ON public.security_scores FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for vps_metrics
ALTER PUBLICATION supabase_realtime ADD TABLE public.vps_metrics;

-- Insert default cloud providers (including Vultr and Linode)
INSERT INTO public.cloud_config (provider, region, instance_type, is_active, status, use_free_tier)
VALUES 
  ('vultr', 'nrt', 'vhf-1c-1gb', false, 'not_configured', true),
  ('linode', 'ap-northeast', 'g6-nanode-1', false, 'not_configured', true)
ON CONFLICT DO NOTHING;