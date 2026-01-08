import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Provider, 
  CredentialField, 
  CredentialStatus, 
  PROVIDER_CONFIGS 
} from '@/types/cloudCredentials';

interface CloudCredentialRow {
  id: string;
  provider: string;
  field_name: string;
  encrypted_value: string;
  status: string;
  last_validated_at: string | null;
  error_message: string | null;
}

export function useCloudCredentials() {
  const [credentials, setCredentials] = useState<CredentialField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState<string | null>(null);

  // Initialize credentials from config
  const initializeCredentials = useCallback(() => {
    const fields: CredentialField[] = [];
    PROVIDER_CONFIGS.forEach(provider => {
      provider.fields.forEach(field => {
        fields.push({
          provider: provider.name,
          fieldName: field.fieldName,
          displayName: field.displayName,
          value: '',
          status: 'pending',
          isTextarea: field.isTextarea,
        });
      });
    });
    return fields;
  }, []);

  // Fetch credentials from database
  const fetchCredentials = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('cloud_credentials')
        .select('*');

      if (error) throw error;

      // Map database rows to credentials
      const initialCreds = initializeCredentials();
      const mappedCreds = initialCreds.map(cred => {
        const dbRow = (data as CloudCredentialRow[])?.find(
          row => row.provider === cred.provider && row.field_name === cred.fieldName
        );
        if (dbRow) {
          return {
            ...cred,
            id: dbRow.id,
            value: dbRow.encrypted_value || '',
            status: dbRow.status as CredentialStatus,
            errorMessage: dbRow.error_message || undefined,
            lastValidatedAt: dbRow.last_validated_at || undefined,
          };
        }
        return cred;
      });

      setCredentials(mappedCreds);
    } catch (error) {
      console.error('Error fetching credentials:', error);
      toast.error('Failed to load credentials');
      setCredentials(initializeCredentials());
    } finally {
      setIsLoading(false);
    }
  }, [initializeCredentials]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  // Save a single credential
  const saveCredential = useCallback(async (provider: Provider, fieldName: string, value: string) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('cloud_credentials')
        .upsert({
          provider,
          field_name: fieldName,
          encrypted_value: value,
          status: 'pending',
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'provider,field_name',
        });

      if (error) throw error;

      // Update local state
      setCredentials(prev => prev.map(cred => {
        if (cred.provider === provider && cred.fieldName === fieldName) {
          return { ...cred, value, status: 'pending' as CredentialStatus };
        }
        return cred;
      }));
    } catch (error) {
      console.error('Error saving credential:', error);
      toast.error('Failed to save credential');
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Validate credentials for a provider
  const validateProvider = useCallback(async (provider: Provider): Promise<boolean> => {
    setIsValidating(provider);
    try {
      // Get all credentials for this provider
      const providerCreds = credentials.filter(c => c.provider === provider);
      const hasAllValues = providerCreds.every(c => c.value.trim() !== '');

      if (!hasAllValues) {
        toast.error(`Please fill in all ${provider.toUpperCase()} credentials`);
        return false;
      }

      // Build credentials object
      const credsObj: Record<string, string> = {};
      providerCreds.forEach(c => {
        credsObj[c.fieldName] = c.value;
      });

      // Call validation edge function
      const { data, error } = await supabase.functions.invoke(`${provider}-cloud`, {
        body: { action: 'validate', credentials: credsObj },
      });

      if (error) throw error;

      const isValid = data?.valid === true;
      const errorMsg = data?.error || 'Validation failed';

      // Update status in database
      for (const cred of providerCreds) {
        await supabase
          .from('cloud_credentials')
          .update({
            status: isValid ? 'validated' : 'error',
            error_message: isValid ? null : errorMsg,
            last_validated_at: new Date().toISOString(),
          })
          .eq('provider', provider)
          .eq('field_name', cred.fieldName);
      }

      // Update local state
      setCredentials(prev => prev.map(cred => {
        if (cred.provider === provider) {
          return {
            ...cred,
            status: isValid ? 'validated' : 'error',
            errorMessage: isValid ? undefined : errorMsg,
            lastValidatedAt: new Date().toISOString(),
          };
        }
        return cred;
      }));

      if (isValid) {
        toast.success(`${provider.toUpperCase()} credentials validated successfully`);
      } else {
        toast.error(`${provider.toUpperCase()} validation failed: ${errorMsg}`);
      }

      return isValid;
    } catch (error) {
      console.error('Error validating credentials:', error);
      toast.error(`Failed to validate ${provider.toUpperCase()} credentials`);
      return false;
    } finally {
      setIsValidating(null);
    }
  }, [credentials]);

  // Validate all providers
  const validateAllProviders = useCallback(async () => {
    const results: Record<Provider, boolean> = {} as Record<Provider, boolean>;
    
    for (const config of PROVIDER_CONFIGS) {
      const providerCreds = credentials.filter(c => c.provider === config.name);
      const hasAnyValue = providerCreds.some(c => c.value.trim() !== '');
      
      if (hasAnyValue) {
        results[config.name] = await validateProvider(config.name);
      }
    }

    const validCount = Object.values(results).filter(Boolean).length;
    const totalCount = Object.keys(results).length;

    if (totalCount > 0) {
      toast.info(`Validated ${validCount}/${totalCount} providers`);
    } else {
      toast.warning('No credentials to validate');
    }

    return results;
  }, [credentials, validateProvider]);

  // Clear all credentials
  const clearAllCredentials = useCallback(async () => {
    try {
      const { error } = await supabase
        .from('cloud_credentials')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (error) throw error;

      setCredentials(initializeCredentials());
      toast.success('All credentials cleared');
    } catch (error) {
      console.error('Error clearing credentials:', error);
      toast.error('Failed to clear credentials');
    }
  }, [initializeCredentials]);

  // Get provider status
  const getProviderStatus = useCallback((provider: Provider): 'not_configured' | 'pending' | 'validated' | 'error' => {
    const providerCreds = credentials.filter(c => c.provider === provider);
    const hasAnyValue = providerCreds.some(c => c.value.trim() !== '');

    if (!hasAnyValue) return 'not_configured';

    const hasError = providerCreds.some(c => c.status === 'error');
    if (hasError) return 'error';

    const allValidated = providerCreds.every(c => c.status === 'validated');
    if (allValidated) return 'validated';

    return 'pending';
  }, [credentials]);

  // Save all credentials for a provider at once
  const saveProviderCredentials = useCallback(async (provider: Provider): Promise<boolean> => {
    setIsSaving(true);
    try {
      const providerCreds = credentials.filter(c => c.provider === provider);
      
      for (const cred of providerCreds) {
        if (cred.value.trim()) {
          const { error } = await supabase
            .from('cloud_credentials')
            .upsert({
              provider,
              field_name: cred.fieldName,
              encrypted_value: cred.value,
              status: 'pending',
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'provider,field_name',
            });

          if (error) throw error;
        }
      }

      toast.success(`${provider.toUpperCase()} credentials saved`);
      return true;
    } catch (error) {
      console.error('Error saving provider credentials:', error);
      toast.error(`Failed to save ${provider.toUpperCase()} credentials`);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [credentials]);

  return {
    credentials,
    isLoading,
    isSaving,
    isValidating,
    saveCredential,
    saveProviderCredentials,
    validateProvider,
    validateAllProviders,
    clearAllCredentials,
    getProviderStatus,
    refetch: fetchCredentials,
  };
}
