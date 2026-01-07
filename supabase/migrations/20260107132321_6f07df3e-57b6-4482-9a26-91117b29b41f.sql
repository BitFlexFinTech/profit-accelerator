-- VPS Deployment Timeline Events table
CREATE TABLE IF NOT EXISTS public.vps_timeline_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'deployment', 'health_check', 'failover', 'cost_optimization', 'benchmark'
  event_subtype TEXT, -- 'started', 'completed', 'failed', 'warning'
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cost Optimization Reports table
CREATE TABLE IF NOT EXISTS public.cost_optimization_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date DATE NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  total_cost_before NUMERIC DEFAULT 0,
  total_cost_after NUMERIC DEFAULT 0,
  savings NUMERIC DEFAULT 0,
  optimizations_applied JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- VPS Benchmark Results table
CREATE TABLE IF NOT EXISTS public.vps_benchmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  benchmark_type TEXT NOT NULL, -- 'latency', 'throughput', 'cpu', 'memory', 'disk_io', 'hft_composite'
  score NUMERIC NOT NULL,
  raw_results JSONB DEFAULT '{}',
  exchange_latencies JSONB DEFAULT '{}', -- latency to each exchange
  hft_score NUMERIC, -- overall HFT performance score 0-100
  run_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_vps_timeline_events_provider ON public.vps_timeline_events(provider);
CREATE INDEX IF NOT EXISTS idx_vps_timeline_events_type ON public.vps_timeline_events(event_type);
CREATE INDEX IF NOT EXISTS idx_vps_timeline_events_created ON public.vps_timeline_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_reports_date ON public.cost_optimization_reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_vps_benchmarks_provider ON public.vps_benchmarks(provider);
CREATE INDEX IF NOT EXISTS idx_vps_benchmarks_run_at ON public.vps_benchmarks(run_at DESC);

-- Enable RLS
ALTER TABLE public.vps_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_optimization_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vps_benchmarks ENABLE ROW LEVEL SECURITY;

-- Open policies (no auth required for this dashboard)
CREATE POLICY "Allow all operations on vps_timeline_events"
  ON public.vps_timeline_events FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on cost_optimization_reports"
  ON public.cost_optimization_reports FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on vps_benchmarks"
  ON public.vps_benchmarks FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for these tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.vps_timeline_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cost_optimization_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vps_benchmarks;