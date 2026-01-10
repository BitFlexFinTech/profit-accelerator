-- Fix ai_provider_accuracy view - add security_invoker
DROP VIEW IF EXISTS ai_provider_accuracy;

CREATE VIEW ai_provider_accuracy 
WITH (security_invoker = true) AS
SELECT 
  p.provider_name,
  p.display_name,
  p.success_count,
  p.error_count,
  CASE 
    WHEN (p.success_count + p.error_count) > 0 
    THEN ROUND((p.success_count::numeric / (p.success_count + p.error_count)::numeric) * 100, 2)
    ELSE 100
  END as accuracy_percent,
  p.total_latency_ms,
  CASE 
    WHEN p.success_count > 0 
    THEN ROUND(p.total_latency_ms::numeric / p.success_count::numeric, 0)
    ELSE 0
  END as avg_latency_ms
FROM ai_providers p
ORDER BY p.priority;

GRANT SELECT ON ai_provider_accuracy TO anon, authenticated;