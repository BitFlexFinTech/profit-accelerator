-- Create table for AI market updates (24/7 AI analysis)
CREATE TABLE IF NOT EXISTS ai_market_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  exchange_name TEXT NOT NULL,
  sentiment TEXT CHECK (sentiment IN ('BULLISH', 'BEARISH', 'NEUTRAL')),
  confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100),
  insight TEXT NOT NULL,
  current_price NUMERIC,
  price_change_24h NUMERIC,
  support_level NUMERIC,
  resistance_level NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ai_market_updates ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Allow public read on ai_market_updates" 
ON ai_market_updates FOR SELECT USING (true);

CREATE POLICY "Allow service insert on ai_market_updates" 
ON ai_market_updates FOR INSERT WITH CHECK (true);

-- Create index for efficient querying by timestamp
CREATE INDEX idx_ai_market_updates_created_at ON ai_market_updates (created_at DESC);

-- Add to realtime publication for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE ai_market_updates;