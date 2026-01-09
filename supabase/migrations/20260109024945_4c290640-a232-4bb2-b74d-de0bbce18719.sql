-- Phase 1: Complete Database Migrations for Trading System

-- 1A: Update simulation_progress for Mode Unlocking
ALTER TABLE simulation_progress 
  ADD COLUMN IF NOT EXISTS successful_simulation_trades INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS simulation_profit_total NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paper_profit_total NUMERIC DEFAULT 0;

-- Reset states to require gates (20 sim trades -> paper, 50 paper trades -> live)
UPDATE simulation_progress SET 
  paper_mode_unlocked = false,
  live_mode_unlocked = false,
  successful_simulation_trades = 0,
  successful_paper_trades = 0
WHERE id = '00000000-0000-0000-0000-000000000001';

-- 1B: Add manual_start_required to trading_config
ALTER TABLE trading_config ADD COLUMN IF NOT EXISTS manual_start_required BOOLEAN DEFAULT true;

UPDATE trading_config SET 
  bot_status = 'stopped',
  trading_enabled = false,
  manual_start_required = true;

-- 1C: Create AI Trade Decisions Audit Table
CREATE TABLE IF NOT EXISTS ai_trade_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL,
  ai_provider TEXT NOT NULL,
  recommended_side TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  reasoning TEXT,
  entry_price NUMERIC,
  target_price NUMERIC,
  expected_profit_percent NUMERIC,
  expected_time_minutes INTEGER,
  actual_outcome TEXT,
  actual_profit NUMERIC,
  was_executed BOOLEAN DEFAULT false,
  trade_id UUID
);

ALTER TABLE ai_trade_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_trade_decisions_all" ON ai_trade_decisions;
CREATE POLICY "ai_trade_decisions_all" ON ai_trade_decisions FOR ALL TO anon USING (true) WITH CHECK (true);

-- 1D: Create System Notifications Table
CREATE TABLE IF NOT EXISTS system_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  severity TEXT DEFAULT 'info',
  category TEXT,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT false,
  dismissed BOOLEAN DEFAULT false
);

ALTER TABLE system_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "system_notifications_all" ON system_notifications;
CREATE POLICY "system_notifications_all" ON system_notifications FOR ALL TO anon USING (true) WITH CHECK (true);

-- 1E: Create VPS Proxy Health Table
CREATE TABLE IF NOT EXISTS vps_proxy_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vps_ip TEXT NOT NULL,
  checked_at TIMESTAMPTZ DEFAULT now(),
  is_healthy BOOLEAN NOT NULL,
  latency_ms INTEGER,
  error_message TEXT,
  consecutive_failures INTEGER DEFAULT 0
);

ALTER TABLE vps_proxy_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vps_proxy_health_all" ON vps_proxy_health;
CREATE POLICY "vps_proxy_health_all" ON vps_proxy_health FOR ALL TO anon USING (true) WITH CHECK (true);

-- 1F: Create Trading Sessions Table (for Leaderboard)
CREATE TABLE IF NOT EXISTS trading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  total_pnl NUMERIC DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  consistency_score NUMERIC DEFAULT 0,
  avg_trade_duration_ms INTEGER,
  best_trade_pnl NUMERIC,
  worst_trade_pnl NUMERIC,
  ai_accuracy_percent NUMERIC DEFAULT 0,
  metadata JSONB DEFAULT '{}'
);

ALTER TABLE trading_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trading_sessions_all" ON trading_sessions;
CREATE POLICY "trading_sessions_all" ON trading_sessions FOR ALL TO anon USING (true) WITH CHECK (true);

-- 1G: Create Database Functions for Mode Unlocking
CREATE OR REPLACE FUNCTION increment_simulation_trade(profit NUMERIC)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE new_count INTEGER; is_unlocked BOOLEAN := false;
BEGIN
  UPDATE simulation_progress 
  SET successful_simulation_trades = COALESCE(successful_simulation_trades, 0) + 1,
      simulation_profit_total = COALESCE(simulation_profit_total, 0) + profit,
      updated_at = now()
  WHERE id = '00000000-0000-0000-0000-000000000001'
  RETURNING successful_simulation_trades INTO new_count;
  
  IF new_count >= 20 AND NOT COALESCE(paper_mode_unlocked, false) THEN
    UPDATE simulation_progress SET paper_mode_unlocked = true
    WHERE id = '00000000-0000-0000-0000-000000000001';
    
    INSERT INTO system_notifications (type, title, message, severity, category)
    VALUES ('mode_unlock', 'Paper Trading Unlocked!', 'Completed 20 profitable simulation trades. Paper trading mode is now available.', 'achievement', 'unlock');
    
    is_unlocked := true;
  END IF;
  RETURN is_unlocked;
END;
$$;

CREATE OR REPLACE FUNCTION increment_paper_trade_v2(profit NUMERIC)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE new_count INTEGER; is_unlocked BOOLEAN := false;
BEGIN
  UPDATE simulation_progress 
  SET successful_paper_trades = COALESCE(successful_paper_trades, 0) + 1,
      paper_profit_total = COALESCE(paper_profit_total, 0) + profit,
      last_paper_trade_at = now(),
      updated_at = now()
  WHERE id = '00000000-0000-0000-0000-000000000001'
  RETURNING successful_paper_trades INTO new_count;
  
  IF new_count >= 50 AND NOT COALESCE(live_mode_unlocked, false) THEN
    UPDATE simulation_progress SET live_mode_unlocked = true
    WHERE id = '00000000-0000-0000-0000-000000000001';
    
    INSERT INTO system_notifications (type, title, message, severity, category)
    VALUES ('mode_unlock', 'Live Trading Unlocked!', 'Completed 50 profitable paper trades. Live trading mode is now available.', 'achievement', 'unlock');
    
    is_unlocked := true;
  END IF;
  RETURN is_unlocked;
END;
$$;

-- 1H: Create AI Provider Accuracy View
CREATE OR REPLACE VIEW ai_provider_accuracy AS
SELECT 
  ai_provider,
  COUNT(*) as total_recommendations,
  SUM(CASE WHEN actual_profit > 0 THEN 1 ELSE 0 END) as correct_predictions,
  ROUND(CASE WHEN COUNT(*) > 0 THEN SUM(CASE WHEN actual_profit > 0 THEN 1 ELSE 0 END)::NUMERIC / COUNT(*) * 100 ELSE 0 END, 2) as accuracy_percent,
  ROUND(AVG(confidence), 2) as avg_confidence,
  ROUND(COALESCE(AVG(actual_profit), 0), 2) as avg_profit
FROM ai_trade_decisions
WHERE was_executed = true AND actual_profit IS NOT NULL
GROUP BY ai_provider;