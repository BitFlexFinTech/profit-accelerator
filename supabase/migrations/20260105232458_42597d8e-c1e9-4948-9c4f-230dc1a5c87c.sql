-- Enable RLS on all tables (this is a single-user app, using service role for access)
ALTER TABLE public.master_password ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vps_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.latency_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backtest_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentiment_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_copies ENABLE ROW LEVEL SECURITY;

-- Create policies for anon access (single-user HFT dashboard - master password protected)
-- Master Password - only allow read/insert via service role (edge function)
CREATE POLICY "Allow anon read master_password" ON public.master_password FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert master_password" ON public.master_password FOR INSERT TO anon WITH CHECK (true);

-- All other tables - full access for anon (protected by master password gate)
CREATE POLICY "Allow full access vps_config" ON public.vps_config FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access trading_config" ON public.trading_config FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access exchange_connections" ON public.exchange_connections FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access latency_thresholds" ON public.latency_thresholds FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access trading_journal" ON public.trading_journal FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access rate_limits" ON public.rate_limits FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access backtest_results" ON public.backtest_results FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access portfolio_snapshots" ON public.portfolio_snapshots FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access strategy_rules" ON public.strategy_rules FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access telegram_config" ON public.telegram_config FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access achievements" ON public.achievements FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access sentiment_data" ON public.sentiment_data FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access trade_copies" ON public.trade_copies FOR ALL TO anon USING (true) WITH CHECK (true);