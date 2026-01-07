import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AIConfig {
  id: string;
  provider: string;
  model: string;
  is_active: boolean;
  last_used_at: string | null;
}

export function useAIConfig() {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ai_config')
        .select('id, provider, model, is_active, last_used_at')
        .eq('provider', 'groq')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setConfig(data);
    } catch (err) {
      console.error('Error fetching AI config:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch AI config');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('ai_config_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_config' }, fetchConfig)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConfig]);

  const saveConfig = async (apiKey: string, model: string) => {
    console.log('[useAIConfig] === SAVE START ===');
    console.log('[useAIConfig] apiKey length:', apiKey?.length);
    console.log('[useAIConfig] model:', model);
    
    const trimmedKey = apiKey?.trim();
    if (!trimmedKey || trimmedKey.length < 10) {
      console.error('[useAIConfig] Local validation failed: API key too short');
      toast.error('API key must be at least 10 characters');
      return { success: false, error: 'API key must be at least 10 characters' };
    }
    
    try {
      console.log('[useAIConfig] Invoking ai-analyze edge function...');
      toast.loading('Saving AI configuration...', { id: 'ai-save' });
      
      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { action: 'save-config', apiKey: trimmedKey, model }
      });

      console.log('[useAIConfig] Response data:', JSON.stringify(data));
      console.log('[useAIConfig] Response error:', error);

      if (error) {
        console.error('[useAIConfig] Function invoke error:', error);
        toast.error(`Failed to save: ${error.message}`, { id: 'ai-save' });
        throw error;
      }
      
      if (!data?.success) {
        console.error('[useAIConfig] Server returned failure:', data?.error);
        toast.error(data?.error || 'Save failed', { id: 'ai-save' });
        return { success: false, error: data?.error || 'Save failed' };
      }
      
      await fetchConfig();
      console.log('[useAIConfig] === SAVE SUCCESS ===');
      toast.success('AI configuration saved!', { id: 'ai-save' });
      return { success: true };
    } catch (err) {
      console.error('[useAIConfig] Caught error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to save';
      toast.error(errorMsg, { id: 'ai-save' });
      return { success: false, error: errorMsg };
    }
  };

  const validateKey = async () => {
    // Validate via edge function (uses Supabase secret)
    try {
      console.log('[useAIConfig] Validating API key via edge function...');
      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { action: 'validate-key' }
      });

      if (error) {
        console.error('[useAIConfig] Validation error:', error);
        return { success: false, error: error.message };
      }

      return { success: data?.success || false, error: data?.error };
    } catch (err) {
      console.error('[useAIConfig] Validation failed:', err);
      return { success: false, error: 'Validation failed' };
    }
  };

  const toggleActive = async (isActive: boolean) => {
    if (!config) return { success: false };
    
    try {
      const { error } = await supabase
        .from('ai_config')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', config.id);

      if (error) throw error;
      await fetchConfig();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to toggle' };
    }
  };

  return {
    config,
    isLoading,
    error,
    isActive: config?.is_active ?? false,
    model: config?.model ?? 'llama-3.3-70b-versatile',
    saveConfig,
    validateKey,
    toggleActive,
    refetch: fetchConfig,
  };
}
