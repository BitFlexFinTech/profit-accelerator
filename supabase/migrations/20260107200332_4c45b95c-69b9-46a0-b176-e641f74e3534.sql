-- Enable RLS on new tables
ALTER TABLE cloud_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE vps_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_logs ENABLE ROW LEVEL SECURITY;

-- Policies for cloud_credentials (allow all operations for now since no auth)
CREATE POLICY "Allow all access to cloud_credentials" ON cloud_credentials FOR ALL USING (true) WITH CHECK (true);

-- Policies for vps_instances
CREATE POLICY "Allow all access to vps_instances" ON vps_instances FOR ALL USING (true) WITH CHECK (true);

-- Policies for deployment_logs
CREATE POLICY "Allow all access to deployment_logs" ON deployment_logs FOR ALL USING (true) WITH CHECK (true);