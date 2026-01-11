-- Fix AI providers without secrets - mark as inactive
UPDATE ai_providers 
SET is_enabled = false, is_active = false 
WHERE has_secret = false;

-- Fix Vultr cloud config status - mark as active since credentials are saved
UPDATE cloud_config 
SET status = 'active', is_active = true 
WHERE provider = 'vultr' AND status IN ('configured', 'pending');

-- Insert missing strategies (no unique constraint, so just insert)
INSERT INTO trading_strategies (name, description, is_active, is_paused, position_size, profit_target, daily_goal, source_framework, trading_mode, leverage)
SELECT 'Momentum Scalper', 'RSI + Volume breakout strategy', false, true, 100, 5, 50, NULL, 'spot', 1
WHERE NOT EXISTS (SELECT 1 FROM trading_strategies WHERE name = 'Momentum Scalper');

INSERT INTO trading_strategies (name, description, is_active, is_paused, position_size, profit_target, daily_goal, source_framework, trading_mode, leverage)
SELECT 'Mean Reversion', 'Bollinger Band bounces', false, true, 100, 8, 80, NULL, 'spot', 1
WHERE NOT EXISTS (SELECT 1 FROM trading_strategies WHERE name = 'Mean Reversion');

INSERT INTO trading_strategies (name, description, is_active, is_paused, position_size, profit_target, daily_goal, source_framework, trading_mode, leverage)
SELECT 'Freqtrade Scalper', 'High-frequency scalping using RSI + Bollinger', false, true, 100, 5, 50, 'freqtrade', 'futures', 3
WHERE NOT EXISTS (SELECT 1 FROM trading_strategies WHERE name = 'Freqtrade Scalper');

INSERT INTO trading_strategies (name, description, is_active, is_paused, position_size, profit_target, daily_goal, source_framework, trading_mode, leverage)
SELECT 'Jesse Momentum', 'Trend-following with ML signals', false, true, 200, 10, 100, 'jesse', 'futures', 5
WHERE NOT EXISTS (SELECT 1 FROM trading_strategies WHERE name = 'Jesse Momentum');

INSERT INTO trading_strategies (name, description, is_active, is_paused, position_size, profit_target, daily_goal, source_framework, trading_mode, leverage)
SELECT 'vnpy Grid Trader', 'Grid trading for range-bound markets', false, true, 150, 3, 30, 'vnpy', 'spot', 1
WHERE NOT EXISTS (SELECT 1 FROM trading_strategies WHERE name = 'vnpy Grid Trader');

INSERT INTO trading_strategies (name, description, is_active, is_paused, position_size, profit_target, daily_goal, source_framework, trading_mode, leverage)
SELECT 'Superalgos Arbitrage', 'Cross-exchange arbitrage detection', false, true, 500, 2, 50, 'superalgos', 'spot', 1
WHERE NOT EXISTS (SELECT 1 FROM trading_strategies WHERE name = 'Superalgos Arbitrage');