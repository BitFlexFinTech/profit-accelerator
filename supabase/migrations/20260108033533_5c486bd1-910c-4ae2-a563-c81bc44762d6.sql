-- Add unique constraint on provider column for upsert support
ALTER TABLE ai_config 
ADD CONSTRAINT ai_config_provider_unique UNIQUE (provider);