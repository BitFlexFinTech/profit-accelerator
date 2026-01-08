-- Create strategy_trades table to track all Profit Piranha trades
CREATE TABLE public.strategy_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_name TEXT NOT NULL DEFAULT 'profit-piranha',
  exchange_name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  entry_price DECIMAL NOT NULL,
  exit_price DECIMAL,
  size DECIMAL NOT NULL,
  position_value DECIMAL NOT NULL,
  fees_paid DECIMAL DEFAULT 0,
  gross_pnl DECIMAL,
  net_pnl DECIMAL,
  profit_target DECIMAL NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  entry_time TIMESTAMPTZ DEFAULT NOW(),
  exit_time TIMESTAMPTZ,
  hold_duration_seconds INTEGER,
  vps_ip TEXT,
  vps_provider TEXT,
  is_leverage BOOLEAN DEFAULT false,
  leverage_multiplier INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create strategy_config table to manage strategy settings
CREATE TABLE public.strategy_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  min_position_size DECIMAL DEFAULT 350,
  max_position_size DECIMAL DEFAULT 500,
  profit_target_spot DECIMAL DEFAULT 1.00,
  profit_target_leverage DECIMAL DEFAULT 3.00,
  max_concurrent_positions INTEGER DEFAULT 10,
  allowed_exchanges TEXT[] DEFAULT ARRAY['binance', 'bybit', 'okx'],
  allowed_symbols TEXT[] DEFAULT ARRAY['BTC/USDT', 'ETH/USDT'],
  use_leverage BOOLEAN DEFAULT false,
  leverage_multiplier INTEGER DEFAULT 1,
  trade_both_directions BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default Profit Piranha configuration
INSERT INTO public.strategy_config (
  strategy_name,
  display_name,
  is_enabled,
  min_position_size,
  max_position_size,
  profit_target_spot,
  profit_target_leverage,
  allowed_exchanges,
  allowed_symbols,
  trade_both_directions
) VALUES (
  'profit-piranha',
  'Profit Piranha',
  false,
  350,
  500,
  1.00,
  3.00,
  ARRAY['binance', 'bybit', 'okx', 'bitget', 'kucoin', 'mexc', 'gateio', 'hyperliquid'],
  ARRAY['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
  true
);

-- Add columns to alert_config for configurable latency thresholds
ALTER TABLE public.alert_config 
ADD COLUMN IF NOT EXISTS latency_threshold_healthy INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS latency_threshold_jitter INTEGER DEFAULT 80;

-- Create indexes for performance
CREATE INDEX idx_strategy_trades_status ON public.strategy_trades(status);
CREATE INDEX idx_strategy_trades_strategy ON public.strategy_trades(strategy_name);
CREATE INDEX idx_strategy_trades_exchange ON public.strategy_trades(exchange_name);
CREATE INDEX idx_strategy_trades_entry_time ON public.strategy_trades(entry_time DESC);

-- Enable RLS
ALTER TABLE public.strategy_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_config ENABLE ROW LEVEL SECURITY;

-- Create permissive policies (single-user system)
CREATE POLICY "Allow all access to strategy_trades" ON public.strategy_trades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to strategy_config" ON public.strategy_config FOR ALL USING (true) WITH CHECK (true);