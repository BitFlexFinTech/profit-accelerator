-- Cloud provider credentials table with per-field storage
CREATE TABLE cloud_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  encrypted_value TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'error')),
  last_validated_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, field_name)
);

CREATE INDEX idx_cloud_credentials_provider ON cloud_credentials(provider);
CREATE INDEX idx_cloud_credentials_status ON cloud_credentials(status);

-- VPS instances table (for tracking deployed servers)
CREATE TABLE vps_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id VARCHAR(255) UNIQUE,
  provider VARCHAR(50) NOT NULL,
  provider_instance_id VARCHAR(255),
  nickname VARCHAR(255),
  ip_address VARCHAR(45),
  region VARCHAR(100),
  instance_size VARCHAR(50),
  status VARCHAR(50) DEFAULT 'creating' CHECK (status IN ('creating', 'running', 'stopped', 'rebooting', 'error', 'deleted')),
  bot_status VARCHAR(50) DEFAULT 'pending' CHECK (bot_status IN ('pending', 'running', 'stopped', 'crashed', 'error')),
  ssh_private_key TEXT,
  bot_pid INTEGER,
  config JSONB,
  monthly_cost DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_health_check TIMESTAMPTZ,
  uptime_seconds INTEGER DEFAULT 0
);

CREATE INDEX idx_vps_instances_provider ON vps_instances(provider);
CREATE INDEX idx_vps_instances_status ON vps_instances(status);
CREATE INDEX idx_vps_instances_deployment ON vps_instances(deployment_id);

-- Deployment progress logs table
CREATE TABLE deployment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  instance_id UUID REFERENCES vps_instances(id) ON DELETE SET NULL,
  stage VARCHAR(100),
  stage_number INTEGER,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'error', 'skipped')),
  progress INTEGER DEFAULT 0,
  message TEXT,
  error_details TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deployment_logs_deployment ON deployment_logs(deployment_id);
CREATE INDEX idx_deployment_logs_status ON deployment_logs(status);

-- Add replica identity for realtime
ALTER TABLE deployment_logs REPLICA IDENTITY FULL;

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE deployment_logs;

-- Update triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cloud_credentials_updated_at
  BEFORE UPDATE ON cloud_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_vps_instances_updated_at
  BEFORE UPDATE ON vps_instances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();