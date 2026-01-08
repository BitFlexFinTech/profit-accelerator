import { useEffect } from 'react';
import { useFormWithSave } from './useFormWithSave';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface UserSettings {
  id: string;
  default_currency: string;
  theme: string;
  language: string;
  timezone: string;
  notifications_enabled: boolean;
  email_alerts: boolean;
  telegram_alerts: boolean;
  daily_report_enabled: boolean;
  weekly_report_enabled: boolean;
  auto_refresh_interval: number;
  sound_alerts: boolean;
  compact_mode: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  id: '00000000-0000-0000-0000-000000000001',
  default_currency: 'USDT',
  theme: 'dark',
  language: 'en',
  timezone: 'UTC',
  notifications_enabled: true,
  email_alerts: false,
  telegram_alerts: true,
  daily_report_enabled: true,
  weekly_report_enabled: true,
  auto_refresh_interval: 5,
  sound_alerts: false,
  compact_mode: false,
};

export function useUserSettings() {
  const form = useFormWithSave<UserSettings>('user_settings', DEFAULT_SETTINGS);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('id', DEFAULT_SETTINGS.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No row found, create default
          await supabase.from('user_settings').insert(DEFAULT_SETTINGS);
          form.setFormData(DEFAULT_SETTINGS);
        } else {
          throw error;
        }
      } else if (data) {
        form.setFormData(data as UserSettings);
      }
    } catch (err) {
      console.error('[useUserSettings] Failed to load:', err);
      form.setFormData(DEFAULT_SETTINGS);
    }
  };

  const validateSettings = (data: UserSettings): Record<string, string> | null => {
    const errors: Record<string, string> = {};
    
    if (data.auto_refresh_interval < 1 || data.auto_refresh_interval > 60) {
      errors.auto_refresh_interval = 'Refresh interval must be between 1 and 60 seconds';
    }
    
    return Object.keys(errors).length > 0 ? errors : null;
  };

  const saveSettings = async () => {
    const result = await form.save(validateSettings);
    
    if (result.success) {
      toast.success('Settings saved successfully');
    } else if (result.error) {
      toast.error(`Failed to save settings: ${result.error}`);
    }
    
    return result;
  };

  const resetToDefaults = async () => {
    form.setFormData({ ...DEFAULT_SETTINGS, id: form.data.id });
    const result = await form.save();
    if (result.success) {
      toast.success('Settings reset to defaults');
    }
  };

  return {
    settings: form.data,
    saving: form.saving,
    errors: form.errors,
    isDirty: form.isDirty,
    status: form.status,
    update: form.update,
    save: saveSettings,
    reset: form.reset,
    resetToDefaults,
    reload: loadSettings,
  };
}
