-- Add delay tracking columns to trade_copies table
ALTER TABLE trade_copies ADD COLUMN IF NOT EXISTS delay_ms integer DEFAULT 0;
ALTER TABLE trade_copies ADD COLUMN IF NOT EXISTS executed_at timestamp with time zone;

-- Add comments for documentation
COMMENT ON COLUMN trade_copies.delay_ms IS 'Latency in milliseconds between source trade and copy execution';
COMMENT ON COLUMN trade_copies.executed_at IS 'Timestamp when the copied trade was executed';

-- Fix function search paths (security best practice)
ALTER FUNCTION public.update_updated_at_column() SET search_path TO 'public';
ALTER FUNCTION public.record_balance_snapshot() SET search_path TO 'public';
ALTER FUNCTION public.sync_hft_to_vps() SET search_path TO 'public';