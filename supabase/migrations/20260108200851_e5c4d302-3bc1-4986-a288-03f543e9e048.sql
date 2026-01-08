-- Create simulation_progress table for tracking paper/live mode unlocks
CREATE TABLE IF NOT EXISTS public.simulation_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  successful_paper_trades INTEGER DEFAULT 0,
  last_paper_trade_at TIMESTAMPTZ,
  simulation_completed BOOLEAN DEFAULT false,
  paper_mode_unlocked BOOLEAN DEFAULT false,
  live_mode_unlocked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.simulation_progress ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (single-user app)
CREATE POLICY "Allow all operations on simulation_progress" 
ON public.simulation_progress 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Insert initial record
INSERT INTO public.simulation_progress (id, successful_paper_trades, paper_mode_unlocked, live_mode_unlocked)
VALUES ('00000000-0000-0000-0000-000000000001', 0, false, false)
ON CONFLICT (id) DO NOTHING;