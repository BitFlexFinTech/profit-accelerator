-- Backfill closed_at for existing closed trades that are missing it
UPDATE trading_journal 
SET closed_at = COALESCE(created_at, NOW()) 
WHERE status = 'closed' AND closed_at IS NULL;