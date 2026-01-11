-- Create sessions table for server-side authentication
CREATE TABLE IF NOT EXISTS active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity TIMESTAMPTZ DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);

ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions_service_only" ON active_sessions 
FOR ALL USING (is_service_role()) WITH CHECK (is_service_role());

-- Create index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_active_sessions_token ON active_sessions(token);
CREATE INDEX IF NOT EXISTS idx_active_sessions_expires ON active_sessions(expires_at);

-- Create password_attempts table for rate limiting
CREATE TABLE IF NOT EXISTS password_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT,
  attempted_at TIMESTAMPTZ DEFAULT now(),
  success BOOLEAN DEFAULT false
);

ALTER TABLE password_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "password_attempts_service_only" ON password_attempts 
FOR ALL USING (is_service_role()) WITH CHECK (is_service_role());

-- Create index for rate limit queries
CREATE INDEX IF NOT EXISTS idx_password_attempts_ip_time 
ON password_attempts(ip_address, attempted_at);

-- Cleanup function for expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM active_sessions WHERE expires_at < now();
  DELETE FROM password_attempts WHERE attempted_at < now() - interval '1 hour';
END;
$$;