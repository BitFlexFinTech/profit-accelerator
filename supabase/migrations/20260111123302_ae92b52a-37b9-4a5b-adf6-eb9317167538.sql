-- Add SELECT policies for realtime subscriptions (fixes CHANNEL_ERROR)
-- Using CREATE POLICY IF NOT EXISTS pattern

DO $$
BEGIN
  -- cloud_config
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cloud_config' AND policyname = 'Allow public select cloud_config') THEN
    CREATE POLICY "Allow public select cloud_config" ON cloud_config FOR SELECT USING (true);
  END IF;
  
  -- ai_providers
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_providers' AND policyname = 'Allow public select ai_providers') THEN
    CREATE POLICY "Allow public select ai_providers" ON ai_providers FOR SELECT USING (true);
  END IF;
  
  -- trading_strategies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trading_strategies' AND policyname = 'Allow public select trading_strategies') THEN
    CREATE POLICY "Allow public select trading_strategies" ON trading_strategies FOR SELECT USING (true);
  END IF;
  
  -- strategy_config
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'strategy_config' AND policyname = 'Allow public select strategy_config') THEN
    CREATE POLICY "Allow public select strategy_config" ON strategy_config FOR SELECT USING (true);
  END IF;
  
  -- exchange_connections
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'exchange_connections' AND policyname = 'Allow public select exchange_connections') THEN
    CREATE POLICY "Allow public select exchange_connections" ON exchange_connections FOR SELECT USING (true);
  END IF;
  
  -- trading_journal
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trading_journal' AND policyname = 'Allow public select trading_journal') THEN
    CREATE POLICY "Allow public select trading_journal" ON trading_journal FOR SELECT USING (true);
  END IF;
  
  -- exchange_pulse
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'exchange_pulse' AND policyname = 'Allow public select exchange_pulse') THEN
    CREATE POLICY "Allow public select exchange_pulse" ON exchange_pulse FOR SELECT USING (true);
  END IF;
END
$$;