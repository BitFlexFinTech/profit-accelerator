-- Step 1: Create the supabase_realtime publication if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Step 2: Enable REPLICA IDENTITY FULL for complete row data
ALTER TABLE ai_config REPLICA IDENTITY FULL;
ALTER TABLE exchange_connections REPLICA IDENTITY FULL;
ALTER TABLE vps_config REPLICA IDENTITY FULL;
ALTER TABLE cloud_config REPLICA IDENTITY FULL;
ALTER TABLE trading_config REPLICA IDENTITY FULL;
ALTER TABLE telegram_config REPLICA IDENTITY FULL;

-- Step 3: Add tables to publication (ignore if already added)
DO $$
BEGIN
  -- ai_config
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'ai_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ai_config;
  END IF;
  
  -- exchange_connections
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'exchange_connections'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE exchange_connections;
  END IF;
  
  -- vps_config
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'vps_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE vps_config;
  END IF;
  
  -- cloud_config
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'cloud_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cloud_config;
  END IF;
  
  -- trading_config
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'trading_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE trading_config;
  END IF;
  
  -- telegram_config
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'telegram_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE telegram_config;
  END IF;
END $$;