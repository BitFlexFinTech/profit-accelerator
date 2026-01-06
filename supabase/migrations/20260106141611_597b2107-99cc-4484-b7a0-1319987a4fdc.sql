-- Add trading mode, leverage, test_mode, and bot_status to trading_config
ALTER TABLE trading_config 
ADD COLUMN IF NOT EXISTS trading_mode TEXT DEFAULT 'spot',
ADD COLUMN IF NOT EXISTS leverage INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS test_mode BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS bot_status TEXT DEFAULT 'idle';

-- Create trading_strategies table for Strategy Builder
CREATE TABLE IF NOT EXISTS public.trading_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  is_paused BOOLEAN DEFAULT true,
  win_rate DECIMAL DEFAULT 0,
  trades_today INTEGER DEFAULT 0,
  pnl_today DECIMAL DEFAULT 0,
  vps_ip TEXT DEFAULT '167.179.83.239',
  trading_mode TEXT DEFAULT 'spot',
  leverage INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE trading_strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for trading_strategies" ON trading_strategies FOR ALL USING (true) WITH CHECK (true);

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE trading_strategies;

-- Update exchange balances to match real equity
UPDATE exchange_connections 
SET balance_usdt = 1466.08, balance_updated_at = now(), is_connected = true
WHERE LOWER(exchange_name) = 'okx';

UPDATE exchange_connections 
SET balance_usdt = 1490.71, balance_updated_at = now(), is_connected = true
WHERE LOWER(exchange_name) = 'binance';

-- Ensure VPS is set to idle (not running) by default for safety
UPDATE vps_config 
SET status = 'idle'
WHERE provider = 'vultr';

-- Set bot to idle state - never auto-start
UPDATE trading_config
SET trading_enabled = false, bot_status = 'idle', test_mode = true;

-- Insert sample strategies for the Strategy Builder
INSERT INTO trading_strategies (name, description, is_active, is_paused, win_rate, trades_today, pnl_today)
VALUES 
  ('Momentum Scalper', 'RSI + Volume breakout strategy', false, true, 0, 0, 0),
  ('Mean Reversion', 'Bollinger Band bounces', false, true, 0, 0, 0)
ON CONFLICT DO NOTHING;