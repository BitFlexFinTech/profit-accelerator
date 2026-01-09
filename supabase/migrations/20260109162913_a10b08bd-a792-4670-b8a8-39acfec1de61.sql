-- Clean up paper/simulation related database elements

-- 1. Drop the simulation_progress table
DROP TABLE IF EXISTS simulation_progress CASCADE;

-- 2. Drop paper/simulation RPC functions
DROP FUNCTION IF EXISTS increment_paper_trade();
DROP FUNCTION IF EXISTS increment_paper_trade_v2(NUMERIC);
DROP FUNCTION IF EXISTS increment_simulation_trade(NUMERIC);

-- 3. Remove paper_trade column from trading_journal
ALTER TABLE trading_journal DROP COLUMN IF EXISTS paper_trade;

-- 4. Reset bot status to stopped (not error)
UPDATE trading_config 
SET bot_status = 'stopped', 
    trading_enabled = false,
    trading_mode = 'live',
    updated_at = now()
WHERE bot_status = 'error';

-- 5. Reset VPS bot status
UPDATE vps_instances 
SET bot_status = 'stopped',
    updated_at = now()
WHERE bot_status = 'error';

-- 6. Reset HFT deployments bot status
UPDATE hft_deployments 
SET bot_status = 'stopped',
    updated_at = now()
WHERE bot_status = 'error';