-- Create AI configuration table for Groq
CREATE TABLE public.ai_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'groq',
  api_key TEXT,
  model TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
  is_active BOOLEAN DEFAULT false,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create Cloud configuration table for VPS providers
CREATE TABLE public.cloud_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  credentials JSONB,
  region TEXT NOT NULL DEFAULT 'ap-northeast-1',
  instance_type TEXT,
  use_free_tier BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'not_configured',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_config ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_config
CREATE POLICY "Allow full access ai_config" ON public.ai_config
  FOR ALL USING (true) WITH CHECK (true);

-- RLS policies for cloud_config
CREATE POLICY "Allow full access cloud_config" ON public.cloud_config
  FOR ALL USING (true) WITH CHECK (true);

-- Insert default AI config row
INSERT INTO public.ai_config (provider, model, is_active)
VALUES ('groq', 'llama-3.3-70b-versatile', false);

-- Insert default cloud provider rows
INSERT INTO public.cloud_config (provider, region, instance_type, use_free_tier, status)
VALUES 
  ('digitalocean', 'sgp1', 's-1vcpu-512mb-10gb', true, 'not_configured'),
  ('aws', 'ap-northeast-1', 't4g.micro', true, 'not_configured'),
  ('gcp', 'asia-northeast1', 'e2-micro', true, 'not_configured');