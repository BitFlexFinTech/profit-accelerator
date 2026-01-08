-- Add UNIQUE constraint on provider for vps_config (required for upsert onConflict)
ALTER TABLE public.vps_config ADD CONSTRAINT vps_config_provider_unique UNIQUE (provider);

-- Add UNIQUE constraint on provider_instance_id for vps_instances (required for upsert onConflict)
CREATE UNIQUE INDEX IF NOT EXISTS vps_instances_provider_instance_id_unique 
ON public.vps_instances (provider_instance_id) 
WHERE provider_instance_id IS NOT NULL;