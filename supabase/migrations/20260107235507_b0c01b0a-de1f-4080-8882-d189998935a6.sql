-- Create system_secrets table for encryption key storage
CREATE TABLE public.system_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_name TEXT UNIQUE NOT NULL,
  secret_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ,
  version INTEGER DEFAULT 1
);

-- Enable RLS
ALTER TABLE public.system_secrets ENABLE ROW LEVEL SECURITY;

-- Block all public access - only service role (edge functions) can access
CREATE POLICY "Service role only" ON public.system_secrets
  FOR ALL USING (false);

-- Add trigger for updated_at
CREATE TRIGGER update_system_secrets_updated_at
  BEFORE UPDATE ON public.system_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();