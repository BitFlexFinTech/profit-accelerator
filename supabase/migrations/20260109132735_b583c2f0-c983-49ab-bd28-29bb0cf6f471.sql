-- Fix HuggingFace endpoint and reset error counts
UPDATE ai_providers SET
  api_endpoint = 'https://router.huggingface.co/v1/chat/completions',
  error_count = 0,
  last_error = NULL,
  daily_usage = 0,
  current_usage = 0,
  cooldown_until = NULL,
  is_active = true
WHERE provider_name = 'huggingface';

-- Enable Together AI as backup provider
UPDATE ai_providers SET
  is_enabled = true,
  is_active = true,
  daily_usage = 0,
  error_count = 0,
  cooldown_until = NULL
WHERE provider_name = 'together';

-- Clear all cooldowns for immediate recovery
UPDATE ai_providers SET
  cooldown_until = NULL,
  current_usage = 0,
  error_count = 0
WHERE provider_name IN ('groq', 'cerebras', 'mistral', 'openrouter');

-- Add source_framework column to trading_strategies
ALTER TABLE trading_strategies 
ADD COLUMN IF NOT EXISTS source_framework TEXT DEFAULT 'custom';

-- Add live trade tracking columns to simulation_progress
ALTER TABLE simulation_progress 
ADD COLUMN IF NOT EXISTS successful_live_trades INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS live_profit_total NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_live_trade_at TIMESTAMPTZ;

-- Create increment_live_trade RPC function
CREATE OR REPLACE FUNCTION public.increment_live_trade(profit numeric DEFAULT 0)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE 
  new_count INTEGER;
BEGIN
  UPDATE simulation_progress 
  SET 
    successful_live_trades = COALESCE(successful_live_trades, 0) + 1,
    live_profit_total = COALESCE(live_profit_total, 0) + profit,
    last_live_trade_at = now(),
    updated_at = now()
  WHERE id = '00000000-0000-0000-0000-000000000001'
  RETURNING successful_live_trades INTO new_count;
  
  RETURN TRUE;
END;
$$;

-- Create bot_signals table for framework signal submission
CREATE TABLE IF NOT EXISTS bot_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  exchange_name TEXT,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  confidence NUMERIC(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  expected_move_percent NUMERIC(10,4),
  timeframe_minutes INTEGER DEFAULT 5,
  current_price NUMERIC(20,8),
  created_at TIMESTAMPTZ DEFAULT now(),
  processed BOOLEAN DEFAULT false
);

-- Add indexes for bot_signals
CREATE INDEX IF NOT EXISTS idx_bot_signals_unprocessed ON bot_signals(processed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_signals_bot_name ON bot_signals(bot_name);

-- Enable RLS on bot_signals
ALTER TABLE bot_signals ENABLE ROW LEVEL SECURITY;

-- Allow all access to bot_signals (signals are not user-specific)
CREATE POLICY "Allow all for bot_signals" ON bot_signals FOR ALL USING (true);

-- Insert bot framework strategy templates
INSERT INTO trading_strategies (name, description, is_active, is_paused, position_size, profit_target, daily_goal, source_framework)
VALUES 
  ('Freqtrade Scalper', 'High-frequency scalping using Freqtrade RSI + Bollinger strategy', false, true, 100, 5, 50, 'freqtrade'),
  ('Jesse Momentum', 'Trend-following strategy using Jesse AI backtester with ML signals', false, true, 200, 10, 100, 'jesse'),
  ('vnpy Grid Trader', 'Event-driven grid trading for range-bound markets using vnpy', false, true, 150, 3, 30, 'vnpy'),
  ('Superalgos Arbitrage', 'Cross-exchange arbitrage detection using Superalgos visual designer', false, true, 500, 2, 50, 'superalgos'),
  ('Backtrader Mean Revert', 'Statistical mean reversion backtested with Backtrader', false, true, 100, 8, 80, 'backtrader'),
  ('Hummingbot Market Maker', 'Automated market making with dynamic spread adjustment', false, true, 300, 1, 40, 'hummingbot')
ON CONFLICT DO NOTHING;