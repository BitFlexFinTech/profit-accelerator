-- First, drop the restrictive region check constraint to allow multiple providers
ALTER TABLE public.vps_config DROP CONSTRAINT IF EXISTS vps_config_region_check;

-- Link existing Vultr server at 167.179.83.239 to Tokyo
-- Delete any existing vultr entries first
DELETE FROM public.vps_config WHERE provider = 'vultr';

-- Insert the new Vultr server with Tokyo region
INSERT INTO public.vps_config (id, provider, region, instance_type, status, outbound_ip, updated_at)
VALUES (
  gen_random_uuid(),
  'vultr',
  'ap-northeast-1',
  'vhf-1c-1gb',
  'running',
  '167.179.83.239',
  now()
);

-- Delete any existing cloud_config for vultr and insert fresh
DELETE FROM public.cloud_config WHERE provider = 'vultr';

INSERT INTO public.cloud_config (id, provider, region, instance_type, is_active, status, use_free_tier, updated_at)
VALUES (
  gen_random_uuid(),
  'vultr',
  'ap-northeast-1',
  'vhf-1c-1gb',
  true,
  'running',
  true,
  now()
);

-- Add Cloudways provider if not exists
INSERT INTO public.cloud_config (id, provider, region, instance_type, status, use_free_tier, is_active)
SELECT gen_random_uuid(), 'cloudways', 'do-tokyo', 'do-1gb', 'not_configured', false, false
WHERE NOT EXISTS (SELECT 1 FROM public.cloud_config WHERE provider = 'cloudways');

-- Add BitLaunch provider if not exists
INSERT INTO public.cloud_config (id, provider, region, instance_type, status, use_free_tier, is_active)
SELECT gen_random_uuid(), 'bitlaunch', 'tok1', 'nibble-1024', 'not_configured', true, false
WHERE NOT EXISTS (SELECT 1 FROM public.cloud_config WHERE provider = 'bitlaunch');

-- Create health_check_results table for daily credential checks
CREATE TABLE IF NOT EXISTS public.health_check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_type TEXT NOT NULL,
  credential_id UUID REFERENCES public.credential_vault(id) ON DELETE CASCADE,
  provider TEXT,
  status TEXT NOT NULL,
  message TEXT,
  details JSONB,
  telegram_notified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on health_check_results
ALTER TABLE public.health_check_results ENABLE ROW LEVEL SECURITY;

-- Create policy for health_check_results (allow all for this single-user app)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'health_check_results' AND policyname = 'Allow all access to health_check_results'
  ) THEN
    CREATE POLICY "Allow all access to health_check_results" 
    ON public.health_check_results 
    FOR ALL 
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_health_check_results_created_at ON public.health_check_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_check_results_status ON public.health_check_results(status);