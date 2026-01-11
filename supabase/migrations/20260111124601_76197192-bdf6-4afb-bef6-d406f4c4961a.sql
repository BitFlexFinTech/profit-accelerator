-- Add missing strategies (no conflict constraint, so just insert if not exists by checking first)
INSERT INTO trading_strategies (name, description, is_active, is_paused, profit_target, source_framework)
SELECT 'Backtrader Mean Revert', 'Mean reversion strategy using Backtrader backtesting framework', false, false, 0.8, 'backtrader'
WHERE NOT EXISTS (SELECT 1 FROM trading_strategies WHERE name = 'Backtrader Mean Revert');

INSERT INTO trading_strategies (name, description, is_active, is_paused, profit_target, source_framework)
SELECT 'Hummingbot Market Maker', 'Automated market making strategy using Hummingbot', false, false, 0.3, 'hummingbot'
WHERE NOT EXISTS (SELECT 1 FROM trading_strategies WHERE name = 'Hummingbot Market Maker');