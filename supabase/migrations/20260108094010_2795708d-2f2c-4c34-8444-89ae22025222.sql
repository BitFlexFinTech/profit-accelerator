-- Add source column to exchange_pulse to track where latency was measured from
ALTER TABLE public.exchange_pulse 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'edge';

-- Add comment for documentation
COMMENT ON COLUMN public.exchange_pulse.source IS 'Where latency was measured from: edge (Supabase) or vps (Tokyo VPS)';