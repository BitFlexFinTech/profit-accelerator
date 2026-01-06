import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RiskSettings {
  maxDailyDrawdown: number;
  maxPositionSize: number;
  globalKillSwitch: boolean;
}

interface LatencySettings {
  region: string;
  executionBuffer: number;
  corsProxy: boolean;
  outboundIp: string | null;
}

interface NotificationSettings {
  notifyOnTrade: boolean;
  notifyOnError: boolean;
  dailyReport: boolean;
}

interface SecuritySettings {
  sessionTimeout: number;
  notifications: NotificationSettings;
}

interface HFTSettings {
  risk: RiskSettings;
  latency: LatencySettings;
  security: SecuritySettings;
}

const DEFAULT_SETTINGS: HFTSettings = {
  risk: {
    maxDailyDrawdown: 5,
    maxPositionSize: 100,
    globalKillSwitch: false
  },
  latency: {
    region: 'ap-northeast-1',
    executionBuffer: 50,
    corsProxy: false,
    outboundIp: null
  },
  security: {
    sessionTimeout: 30,
    notifications: {
      notifyOnTrade: true,
      notifyOnError: true,
      dailyReport: true
    }
  }
};

export function useHFTSettings() {
  const [settings, setSettings] = useState<HFTSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await supabase.functions.invoke('trade-engine', {
        body: { action: 'get-hft-settings' }
      });

      if (response.data?.success) {
        setSettings(response.data.settings);
      }
    } catch (err) {
      console.error('[useHFTSettings] Error fetching:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('hft_settings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vps_config' }, fetchSettings)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trading_config' }, fetchSettings)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSettings]);

  const saveSettings = async (newSettings: Partial<HFTSettings>) => {
    setIsSaving(true);
    try {
      const response = await supabase.functions.invoke('trade-engine', {
        body: {
          action: 'save-hft-settings',
          riskSettings: newSettings.risk,
          latencySettings: newSettings.latency,
          securitySettings: newSettings.security
        }
      });

      if (response.data?.success) {
        setSettings(prev => ({ ...prev, ...newSettings }));
        toast.success('Settings saved successfully');
        return true;
      } else {
        toast.error('Failed to save settings');
        return false;
      }
    } catch (err) {
      console.error('[useHFTSettings] Error saving:', err);
      toast.error('Failed to save settings');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const fetchOutboundIp = async () => {
    try {
      const response = await supabase.functions.invoke('trade-engine', {
        body: { action: 'get-ip' }
      });

      if (response.data?.success) {
        setSettings(prev => ({
          ...prev,
          latency: { ...prev.latency, outboundIp: response.data.ip }
        }));
        return response.data.ip;
      }
    } catch (err) {
      console.error('[useHFTSettings] Error fetching IP:', err);
    }
    return null;
  };

  return {
    settings,
    setSettings,
    isLoading,
    isSaving,
    saveSettings,
    fetchOutboundIp,
    refetch: fetchSettings
  };
}
