-- Create table for exchange latency history tracking
CREATE TABLE IF NOT EXISTS public.exchange_latency_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_name TEXT NOT NULL,
  latency_ms NUMERIC NOT NULL,
  source TEXT NOT NULL DEFAULT 'edge' CHECK (source IN ('edge', 'vps')),
  recorded_at TIMESTAMPTZ DEFAULT now(),
  region TEXT
);

-- Create index for efficient queries
CREATE INDEX idx_latency_history_exchange ON public.exchange_latency_history(exchange_name, recorded_at DESC);
CREATE INDEX idx_latency_history_source ON public.exchange_latency_history(source, recorded_at DESC);

-- Enable RLS
ALTER TABLE public.exchange_latency_history ENABLE ROW LEVEL SECURITY;

-- Allow public read access (no auth required for this monitoring data)
CREATE POLICY "Allow public read access to latency history" 
ON public.exchange_latency_history 
FOR SELECT 
USING (true);

-- Allow service role to insert/update
CREATE POLICY "Allow service role to manage latency history" 
ON public.exchange_latency_history 
FOR ALL 
USING (true) 
WITH CHECK (true);