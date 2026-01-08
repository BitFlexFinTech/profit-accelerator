-- Drop the partial index that doesn't work with ON CONFLICT
DROP INDEX IF EXISTS public.vps_instances_provider_instance_id_unique;

-- Create a proper UNIQUE constraint (not a partial index)
ALTER TABLE public.vps_instances 
ADD CONSTRAINT vps_instances_provider_instance_id_unique 
UNIQUE (provider_instance_id);