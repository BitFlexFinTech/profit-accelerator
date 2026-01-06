-- Add custom credential fields to exchange_connections
ALTER TABLE public.exchange_connections
ADD COLUMN IF NOT EXISTS api_passphrase TEXT,
ADD COLUMN IF NOT EXISTS wallet_address TEXT,
ADD COLUMN IF NOT EXISTS agent_private_key TEXT,
ADD COLUMN IF NOT EXISTS balance_usdt NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS balance_updated_at TIMESTAMPTZ;

-- Add HFT risk management fields to trading_config
ALTER TABLE public.trading_config
ADD COLUMN IF NOT EXISTS max_daily_drawdown_percent NUMERIC DEFAULT 5,
ADD COLUMN IF NOT EXISTS max_position_size NUMERIC DEFAULT 100,
ADD COLUMN IF NOT EXISTS global_kill_switch_enabled BOOLEAN DEFAULT false;

-- Add latency optimizer fields to vps_config
ALTER TABLE public.vps_config
ADD COLUMN IF NOT EXISTS execution_buffer_ms INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS cors_proxy_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS outbound_ip TEXT;

-- Add session timeout to master_password
ALTER TABLE public.master_password
ADD COLUMN IF NOT EXISTS session_timeout_minutes INTEGER DEFAULT 30;

-- Create audit_logs table for tracking all changes
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_value JSONB,
  new_value JSONB,
  principal_before NUMERIC,
  principal_after NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow all operations on audit_logs (no auth in this app)
CREATE POLICY "Allow all operations on audit_logs"
ON public.audit_logs
FOR ALL
USING (true)
WITH CHECK (true);

-- Insert missing exchanges (Nexo, Hyperliquid, Kraken, BingX)
INSERT INTO public.exchange_connections (exchange_name, is_connected)
SELECT 'Nexo', false
WHERE NOT EXISTS (SELECT 1 FROM public.exchange_connections WHERE exchange_name = 'Nexo');

INSERT INTO public.exchange_connections (exchange_name, is_connected)
SELECT 'Hyperliquid', false
WHERE NOT EXISTS (SELECT 1 FROM public.exchange_connections WHERE exchange_name = 'Hyperliquid');

INSERT INTO public.exchange_connections (exchange_name, is_connected)
SELECT 'Kraken', false
WHERE NOT EXISTS (SELECT 1 FROM public.exchange_connections WHERE exchange_name = 'Kraken');

INSERT INTO public.exchange_connections (exchange_name, is_connected)
SELECT 'BingX', false
WHERE NOT EXISTS (SELECT 1 FROM public.exchange_connections WHERE exchange_name = 'BingX');

-- Ensure default trading_config exists
INSERT INTO public.trading_config (id, trading_enabled, order_size, stop_loss, take_profit_1, take_profit_2, max_daily_trades)
SELECT gen_random_uuid(), true, 100, 2, 3, 5, 10
WHERE NOT EXISTS (SELECT 1 FROM public.trading_config LIMIT 1);

-- Ensure default vps_config exists
INSERT INTO public.vps_config (id, region, status, provider, instance_type)
SELECT gen_random_uuid(), 'ap-northeast-1', 'running', 'supabase', 'edge-function'
WHERE NOT EXISTS (SELECT 1 FROM public.vps_config LIMIT 1);