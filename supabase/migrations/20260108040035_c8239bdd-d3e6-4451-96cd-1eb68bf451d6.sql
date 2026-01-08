-- Add error tracking columns to exchange_connections
ALTER TABLE exchange_connections 
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;