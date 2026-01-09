-- Drop paper trading tables (dead code cleanup)
-- All trading is now handled by VPS bot using trading_journal and positions tables

DROP TABLE IF EXISTS paper_balance_history;
DROP TABLE IF EXISTS paper_positions;
DROP TABLE IF EXISTS paper_orders;