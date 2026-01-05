-- Add emergency_stopped_at column to vps_config
ALTER TABLE public.vps_config 
ADD COLUMN IF NOT EXISTS emergency_stopped_at timestamp with time zone;

-- Enable realtime on trading_journal for trade notifications
ALTER TABLE public.trading_journal REPLICA IDENTITY FULL;

-- Add trading_journal to realtime publication (if not already added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'trading_journal'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trading_journal;
  END IF;
END $$;