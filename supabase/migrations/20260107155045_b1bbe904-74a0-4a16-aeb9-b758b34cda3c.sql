-- Create exchange_pulse table for 11-exchange real-time monitoring
CREATE TABLE IF NOT EXISTS public.exchange_pulse (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_name TEXT NOT NULL UNIQUE,
  status TEXT CHECK (status IN ('healthy', 'jitter', 'error')) DEFAULT 'error',
  latency_ms INTEGER DEFAULT 999,
  last_check TIMESTAMPTZ DEFAULT NOW(),
  error_message TEXT,
  region TEXT DEFAULT 'tokyo',
  api_endpoint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.exchange_pulse ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read on exchange_pulse" 
ON public.exchange_pulse 
FOR SELECT 
USING (true);

CREATE POLICY "Allow service write on exchange_pulse" 
ON public.exchange_pulse 
FOR ALL
USING (true)
WITH CHECK (true);

-- Insert default exchanges
INSERT INTO public.exchange_pulse (exchange_name, region, api_endpoint) VALUES
  ('binance', 'tokyo', 'api.binance.com'),
  ('okx', 'tokyo', 'www.okx.com'),
  ('bybit', 'tokyo', 'api.bybit.com'),
  ('bitget', 'tokyo', 'api.bitget.com'),
  ('bingx', 'tokyo', 'open-api.bingx.com'),
  ('mexc', 'tokyo', 'api.mexc.com'),
  ('gateio', 'tokyo', 'api.gateio.ws'),
  ('kucoin', 'tokyo', 'api.kucoin.com'),
  ('kraken', 'us-east', 'api.kraken.com'),
  ('nexo', 'europe', 'api.nexo.io'),
  ('hyperliquid', 'tokyo', 'api.hyperliquid.xyz')
ON CONFLICT (exchange_name) DO NOTHING;

-- Enable realtime for exchange_pulse
ALTER PUBLICATION supabase_realtime ADD TABLE exchange_pulse;