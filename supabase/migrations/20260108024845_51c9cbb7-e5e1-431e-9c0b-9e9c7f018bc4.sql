-- Add version columns for conflict resolution (safe with IF NOT EXISTS)
ALTER TABLE exchange_connections ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_name VARCHAR(50) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('buy', 'sell')),
  type VARCHAR(20) NOT NULL CHECK (type IN ('market', 'limit', 'stop', 'stop_limit')),
  amount DECIMAL(20, 8) NOT NULL,
  price DECIMAL(20, 8),
  filled_amount DECIMAL(20, 8) DEFAULT 0,
  average_fill_price DECIMAL(20, 8),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partially_filled', 'filled', 'cancelled', 'rejected')),
  exchange_order_id VARCHAR(100),
  client_order_id VARCHAR(100) UNIQUE,
  idempotency_key VARCHAR(100) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  filled_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  version INTEGER DEFAULT 1
);

-- Positions table
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_name VARCHAR(50) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('long', 'short')),
  size DECIMAL(20, 8) NOT NULL,
  entry_price DECIMAL(20, 8) NOT NULL,
  current_price DECIMAL(20, 8),
  unrealized_pnl DECIMAL(20, 8) DEFAULT 0,
  realized_pnl DECIMAL(20, 8) DEFAULT 0,
  leverage DECIMAL(5, 2) DEFAULT 1,
  margin DECIMAL(20, 8),
  liquidation_price DECIMAL(20, 8),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exchange_name, symbol, side)
);

-- Paper trading tables
CREATE TABLE IF NOT EXISTS paper_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_name VARCHAR(50) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(10) NOT NULL,
  type VARCHAR(20) NOT NULL,
  amount DECIMAL(20, 8) NOT NULL,
  price DECIMAL(20, 8),
  fill_price DECIMAL(20, 8),
  filled_amount DECIMAL(20, 8) DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  filled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS paper_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_name VARCHAR(50) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(10) NOT NULL,
  size DECIMAL(20, 8) NOT NULL,
  entry_price DECIMAL(20, 8) NOT NULL,
  current_price DECIMAL(20, 8),
  unrealized_pnl DECIMAL(20, 8) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exchange_name, symbol, side)
);

CREATE TABLE IF NOT EXISTS paper_balance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_name VARCHAR(50) NOT NULL,
  total_equity DECIMAL(20, 8) NOT NULL,
  breakdown JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transaction log
CREATE TABLE IF NOT EXISTS transaction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type VARCHAR(50) NOT NULL,
  exchange_name VARCHAR(50),
  symbol VARCHAR(20),
  details JSONB,
  status VARCHAR(20),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_balance_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow all authenticated users (single-tenant system)
CREATE POLICY "orders_all_access" ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "positions_all_access" ON positions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "paper_orders_all_access" ON paper_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "paper_positions_all_access" ON paper_positions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "paper_balance_all_access" ON paper_balance_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "transaction_log_all_access" ON transaction_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anon access for single-tenant without auth requirement
CREATE POLICY "orders_anon_access" ON orders FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "positions_anon_access" ON positions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "paper_orders_anon_access" ON paper_orders FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "paper_positions_anon_access" ON paper_positions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "paper_balance_anon_access" ON paper_balance_history FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "transaction_log_anon_access" ON transaction_log FOR ALL TO anon USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_exchange ON orders(exchange_name);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_order_id);
CREATE INDEX IF NOT EXISTS idx_positions_exchange ON positions(exchange_name);
CREATE INDEX IF NOT EXISTS idx_transaction_log_created ON transaction_log(created_at DESC);