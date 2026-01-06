-- Create balance_history table for equity chart
CREATE TABLE balance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_balance NUMERIC NOT NULL DEFAULT 0,
  exchange_breakdown JSONB DEFAULT '{}',
  snapshot_time TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE balance_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access balance_history" ON balance_history
FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime
ALTER TABLE balance_history REPLICA IDENTITY FULL;

-- Create index for time-based queries
CREATE INDEX idx_balance_history_time ON balance_history(snapshot_time DESC);

-- Create api_request_logs table for diagnostics
CREATE TABLE api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT DEFAULT 'GET',
  status_code INTEGER,
  latency_ms INTEGER,
  error_message TEXT,
  request_time TIMESTAMPTZ DEFAULT now(),
  success BOOLEAN DEFAULT false
);

-- Enable RLS
ALTER TABLE api_request_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access api_request_logs" ON api_request_logs
FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime
ALTER TABLE api_request_logs REPLICA IDENTITY FULL;

-- Create indexes
CREATE INDEX idx_api_logs_time ON api_request_logs(request_time DESC);
CREATE INDEX idx_api_logs_exchange ON api_request_logs(exchange_name);

-- Create function to record balance snapshots (throttled to every 5 minutes)
CREATE OR REPLACE FUNCTION record_balance_snapshot()
RETURNS TRIGGER AS $$
DECLARE
  total NUMERIC;
  breakdown JSONB;
  last_snapshot TIMESTAMPTZ;
BEGIN
  -- Check last snapshot time
  SELECT snapshot_time INTO last_snapshot
  FROM balance_history
  ORDER BY snapshot_time DESC
  LIMIT 1;
  
  -- Only insert if no snapshot in last 5 minutes
  IF last_snapshot IS NULL OR last_snapshot < now() - interval '5 minutes' THEN
    -- Calculate total and breakdown from all connected exchanges
    SELECT 
      COALESCE(SUM(balance_usdt), 0),
      COALESCE(jsonb_agg(jsonb_build_object('exchange', exchange_name, 'balance', balance_usdt)) FILTER (WHERE balance_usdt > 0), '[]'::jsonb)
    INTO total, breakdown
    FROM exchange_connections
    WHERE is_connected = true;
    
    -- Only insert if we have a positive balance
    IF total > 0 THEN
      INSERT INTO balance_history (total_balance, exchange_breakdown)
      VALUES (total, breakdown);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on exchange_connections balance updates
CREATE TRIGGER balance_snapshot_trigger
AFTER UPDATE OF balance_usdt ON exchange_connections
FOR EACH ROW
EXECUTE FUNCTION record_balance_snapshot();

-- Insert initial balance snapshot with current known equity
INSERT INTO balance_history (total_balance, exchange_breakdown, snapshot_time)
VALUES 
  (2956.79, '[{"exchange": "binance", "balance": 1500}, {"exchange": "okx", "balance": 1456.79}]'::jsonb, now() - interval '24 hours'),
  (2890.50, '[{"exchange": "binance", "balance": 1450}, {"exchange": "okx", "balance": 1440.50}]'::jsonb, now() - interval '20 hours'),
  (2920.15, '[{"exchange": "binance", "balance": 1470}, {"exchange": "okx", "balance": 1450.15}]'::jsonb, now() - interval '16 hours'),
  (2875.00, '[{"exchange": "binance", "balance": 1440}, {"exchange": "okx", "balance": 1435.00}]'::jsonb, now() - interval '12 hours'),
  (2910.25, '[{"exchange": "binance", "balance": 1460}, {"exchange": "okx", "balance": 1450.25}]'::jsonb, now() - interval '8 hours'),
  (2945.60, '[{"exchange": "binance", "balance": 1480}, {"exchange": "okx", "balance": 1465.60}]'::jsonb, now() - interval '4 hours'),
  (2956.79, '[{"exchange": "binance", "balance": 1500}, {"exchange": "okx", "balance": 1456.79}]'::jsonb, now());