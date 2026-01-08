-- Add new columns to ai_market_updates for profit timeframe prediction
ALTER TABLE ai_market_updates 
ADD COLUMN IF NOT EXISTS profit_timeframe_minutes INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS recommended_side TEXT DEFAULT 'long',
ADD COLUMN IF NOT EXISTS expected_move_percent NUMERIC DEFAULT 0.25;