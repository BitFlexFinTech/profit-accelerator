-- Master Password table
CREATE TABLE IF NOT EXISTS public.master_password (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- VPS Config (Tokyo region hardcoded)
CREATE TABLE IF NOT EXISTS public.vps_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region TEXT NOT NULL DEFAULT 'ap-northeast-1' CHECK (region = 'ap-northeast-1'),
  provider TEXT DEFAULT 'aws',
  instance_type TEXT DEFAULT 't3.micro',
  status TEXT DEFAULT 'inactive',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trading Config
CREATE TABLE IF NOT EXISTS public.trading_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_size DECIMAL DEFAULT 350,
  take_profit_1 DECIMAL DEFAULT 1,
  take_profit_2 DECIMAL DEFAULT 3,
  stop_loss DECIMAL DEFAULT 2,
  max_daily_trades INTEGER DEFAULT 50,
  trading_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Exchange Connections
CREATE TABLE IF NOT EXISTS public.exchange_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_name TEXT NOT NULL,
  api_key TEXT,
  api_secret TEXT,
  is_connected BOOLEAN DEFAULT false,
  last_ping_ms INTEGER,
  last_ping_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Latency Thresholds
CREATE TABLE IF NOT EXISTS public.latency_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_name TEXT NOT NULL,
  warning_threshold_ms INTEGER DEFAULT 500,
  critical_threshold_ms INTEGER DEFAULT 1000,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trading Journal
CREATE TABLE IF NOT EXISTS public.trading_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  entry_price DECIMAL NOT NULL,
  exit_price DECIMAL,
  quantity DECIMAL NOT NULL,
  pnl DECIMAL,
  status TEXT DEFAULT 'open',
  ai_reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- Rate Limits
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_name TEXT NOT NULL,
  requests_per_minute INTEGER DEFAULT 60,
  current_usage INTEGER DEFAULT 0,
  reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Backtest Results
CREATE TABLE IF NOT EXISTS public.backtest_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_trades INTEGER,
  win_rate DECIMAL,
  total_pnl DECIMAL,
  max_drawdown DECIMAL,
  sharpe_ratio DECIMAL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Portfolio Snapshots
CREATE TABLE IF NOT EXISTS public.portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_balance DECIMAL NOT NULL,
  daily_pnl DECIMAL,
  weekly_pnl DECIMAL,
  monthly_pnl DECIMAL,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Strategy Rules
CREATE TABLE IF NOT EXISTS public.strategy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_name TEXT NOT NULL,
  indicator TEXT NOT NULL,
  condition TEXT NOT NULL,
  value DECIMAL,
  action TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Telegram Config
CREATE TABLE IF NOT EXISTS public.telegram_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token TEXT,
  chat_id TEXT,
  notifications_enabled BOOLEAN DEFAULT true,
  notify_on_trade BOOLEAN DEFAULT true,
  notify_on_error BOOLEAN DEFAULT true,
  notify_daily_summary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Achievements
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  unlocked BOOLEAN DEFAULT false,
  unlocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sentiment Data
CREATE TABLE IF NOT EXISTS public.sentiment_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  symbol TEXT,
  sentiment_score DECIMAL,
  fear_greed_index INTEGER,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

-- Trade Copies
CREATE TABLE IF NOT EXISTS public.trade_copies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_exchange TEXT NOT NULL,
  target_exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  copy_ratio DECIMAL DEFAULT 1.0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default exchanges
INSERT INTO public.exchange_connections (exchange_name) VALUES
  ('Binance'),
  ('Bybit'),
  ('OKX'),
  ('Bitget'),
  ('MEXC'),
  ('Gate.io'),
  ('KuCoin')
ON CONFLICT DO NOTHING;

-- Seed default achievements
INSERT INTO public.achievements (name, description, icon) VALUES
  ('First Trade', 'Complete your first trade', '🎯'),
  ('Profit Master', 'Reach $1000 in total profits', '💰'),
  ('Speed Demon', 'Execute a trade under 50ms latency', '⚡'),
  ('Diversified', 'Connect 3 or more exchanges', '🔗'),
  ('Consistent', 'Trade for 30 consecutive days', '📈'),
  ('Whale', 'Execute a single trade over $10,000', '🐋')
ON CONFLICT DO NOTHING;

-- Seed default VPS config (Tokyo only)
INSERT INTO public.vps_config (region, provider, status) VALUES
  ('ap-northeast-1', 'aws', 'inactive')
ON CONFLICT DO NOTHING;

-- Seed default trading config
INSERT INTO public.trading_config (order_size, take_profit_1, take_profit_2, stop_loss) VALUES
  (350, 1, 3, 2)
ON CONFLICT DO NOTHING;

-- Seed default telegram config
INSERT INTO public.telegram_config (notifications_enabled) VALUES
  (true)
ON CONFLICT DO NOTHING;