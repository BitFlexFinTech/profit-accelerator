-- Delete all duplicates keeping only one row per provider (the one with max id)
DELETE FROM vps_metrics
WHERE id NOT IN (
  SELECT DISTINCT ON (provider) id
  FROM vps_metrics
  ORDER BY provider, recorded_at DESC NULLS LAST, id DESC
);

-- Now add the unique constraint
ALTER TABLE vps_metrics 
ADD CONSTRAINT vps_metrics_provider_unique 
UNIQUE (provider);