import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
    console.log('[useAIConfig] Saving config:', { hasApiKey: !!apiKey, apiKeyLength: apiKey?.length, model });
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { action: 'save-config', apiKey, model }
      });

      console.log('[useAIConfig] Save response:', data, error);

      if (error) throw error;
      await fetchConfig();
      return { success: true };
    } catch (err) {
      console.error('[useAIConfig] Error saving AI config:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Failed to save' };
    }
  };

  const validateKey = async (apiKey: string) => {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'Say OK' }],
          max_tokens: 5,
        }),
      });

      return { success: response.ok };
    } catch (err) {
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
