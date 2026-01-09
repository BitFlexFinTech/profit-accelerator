-- Add unique constraint for credential_permissions
ALTER TABLE credential_permissions 
ADD CONSTRAINT credential_permissions_provider_type_unique 
UNIQUE (provider, credential_type);

-- Add unique constraint for cost_recommendations
ALTER TABLE cost_recommendations 
ADD CONSTRAINT cost_recommendations_type_provider_unique 
UNIQUE (recommendation_type, current_provider);