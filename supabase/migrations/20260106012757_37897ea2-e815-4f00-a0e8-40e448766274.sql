-- Enable REPLICA IDENTITY FULL for complete row data in realtime events
ALTER TABLE ai_config REPLICA IDENTITY FULL;
ALTER TABLE exchange_connections REPLICA IDENTITY FULL;
ALTER TABLE vps_config REPLICA IDENTITY FULL;
ALTER TABLE cloud_config REPLICA IDENTITY FULL;
ALTER TABLE trading_config REPLICA IDENTITY FULL;
ALTER TABLE telegram_config REPLICA IDENTITY FULL;

-- Add tables to supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE ai_config;
ALTER PUBLICATION supabase_realtime ADD TABLE exchange_connections;
ALTER PUBLICATION supabase_realtime ADD TABLE vps_config;
ALTER PUBLICATION supabase_realtime ADD TABLE cloud_config;
ALTER PUBLICATION supabase_realtime ADD TABLE trading_config;
ALTER PUBLICATION supabase_realtime ADD TABLE telegram_config;