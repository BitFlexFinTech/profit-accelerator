-- Fix realtime subscriptions by adding READ policies for dashboard display

-- 1. Add read policy for trading_journal (needed for realtime subscriptions)
CREATE POLICY "Allow read access for trading display" 
ON public.trading_journal FOR SELECT 
USING (true);

-- 2. Add read policy for simulation_progress (needed for paper trade counter)
CREATE POLICY "Allow read access for progress display" 
ON public.simulation_progress FOR SELECT 
USING (true);

-- 3. Add read policy for hft_deployments (needed for dashboard display)
CREATE POLICY "Allow read access for dashboard" 
ON public.hft_deployments FOR SELECT 
USING (true);

-- 4. Add read policy for vps_instances (needed for VPS dashboard)
CREATE POLICY "Allow read access for VPS dashboard" 
ON public.vps_instances FOR SELECT 
USING (true);

-- 5. Add read policy for trading_strategies (needed for strategy display)
CREATE POLICY "Allow read access for strategies display" 
ON public.trading_strategies FOR SELECT 
USING (true);

-- 6. Add read policy for strategy_trades (needed for trade history)
CREATE POLICY "Allow read access for strategy trades" 
ON public.strategy_trades FOR SELECT 
USING (true);