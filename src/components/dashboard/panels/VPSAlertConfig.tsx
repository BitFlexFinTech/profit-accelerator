import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Bell,
  AlertTriangle,
  Cpu,
  HardDrive,
  Wifi,
  Bot,
  Save,
  TestTube,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AlertRule {
  id: string;
  alertType: string;
  channel: string;
  isEnabled: boolean;
  thresholdValue: number | null;
  cooldownMinutes: number;
  webhookUrl: string | null;
}

interface TelegramConfig {
  botToken: string;
  chatId: string;
  notificationsEnabled: boolean;
  notifyOnError: boolean;
}

export function VPSAlertConfig() {
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>({
    botToken: '',
    chatId: '',
    notificationsEnabled: false,
    notifyOnError: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Default alert types
  const defaultAlertTypes = [
    { type: 'cpu_high', label: 'High CPU Usage', icon: Cpu, defaultThreshold: 90 },
    { type: 'ram_high', label: 'High RAM Usage', icon: HardDrive, defaultThreshold: 90 },
    { type: 'disk_high', label: 'High Disk Usage', icon: HardDrive, defaultThreshold: 90 },
    { type: 'instance_offline', label: 'Instance Offline', icon: Wifi, defaultThreshold: null },
    { type: 'bot_crashed', label: 'Bot Crashed', icon: Bot, defaultThreshold: null },
    { type: 'latency_high', label: 'High VPS-Exchange Latency', icon: AlertTriangle, defaultThreshold: 100 },
  ];

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    // Fetch alert rules
    const { data: rules } = await supabase
      .from('alert_config')
      .select('*');

    if (rules) {
      setAlertRules(rules.map((r) => ({
        id: r.id,
        alertType: r.alert_type,
        channel: r.channel,
        isEnabled: r.is_enabled || false,
        thresholdValue: r.threshold_value,
        cooldownMinutes: r.cooldown_minutes || 5,
        webhookUrl: r.webhook_url,
      })));
    } else {
      // Initialize with defaults if none exist
      const defaults = defaultAlertTypes.map((a) => ({
        id: crypto.randomUUID(),
        alertType: a.type,
        channel: 'telegram',
        isEnabled: false,
        thresholdValue: a.defaultThreshold,
        cooldownMinutes: 5,
        webhookUrl: null,
      }));
      setAlertRules(defaults);
    }

    // Fetch Telegram config
    const { data: tg } = await supabase
      .from('telegram_config')
      .select('*')
      .limit(1)
      .single();

    if (tg) {
      setTelegramConfig({
        botToken: tg.bot_token || '',
        chatId: tg.chat_id || '',
        notificationsEnabled: tg.notifications_enabled || false,
        notifyOnError: tg.notify_on_error || true,
      });
    }
  };

  const updateAlertRule = (alertType: string, updates: Partial<AlertRule>) => {
    setAlertRules((prev) =>
      prev.map((r) =>
        r.alertType === alertType ? { ...r, ...updates } : r
      )
    );
  };

  const saveConfig = async () => {
    setIsSaving(true);
    try {
      // Save alert rules
      for (const rule of alertRules) {
        await supabase
          .from('alert_config')
          .upsert({
            id: rule.id,
            alert_type: rule.alertType,
            channel: rule.channel,
            is_enabled: rule.isEnabled,
            threshold_value: rule.thresholdValue,
            cooldown_minutes: rule.cooldownMinutes,
            webhook_url: rule.webhookUrl,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
      }

      // Save Telegram config
      const { data: existing } = await supabase
        .from('telegram_config')
        .select('id')
        .limit(1)
        .single();

      if (existing) {
        await supabase
          .from('telegram_config')
          .update({
            bot_token: telegramConfig.botToken,
            chat_id: telegramConfig.chatId,
            notifications_enabled: telegramConfig.notificationsEnabled,
            notify_on_error: telegramConfig.notifyOnError,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('telegram_config')
          .insert({
            bot_token: telegramConfig.botToken,
            chat_id: telegramConfig.chatId,
            notifications_enabled: telegramConfig.notificationsEnabled,
            notify_on_error: telegramConfig.notifyOnError,
          });
      }

      toast.success('Alert configuration saved');
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const testTelegramAlert = async () => {
    if (!telegramConfig.botToken || !telegramConfig.chatId) {
      toast.error('Please configure Telegram bot token and chat ID first');
      return;
    }

    setIsTesting(true);
    try {
      const { error } = await supabase.functions.invoke('telegram-bot', {
        body: {
          action: 'send-message',
          message: '🧪 Test alert from VPS Health Monitor\n\nIf you see this message, your alert configuration is working correctly!',
        },
      });

      if (error) throw error;
      toast.success('Test alert sent! Check your Telegram.');
    } catch (error) {
      console.error('Test failed:', error);
      toast.error('Failed to send test alert');
    } finally {
      setIsTesting(false);
    }
  };

  const getAlertMeta = (alertType: string) => {
    return defaultAlertTypes.find((a) => a.type === alertType) || {
      type: alertType,
      label: alertType,
      icon: Bell,
      defaultThreshold: null,
    };
  };

  return (
    <div className="space-y-6">
      {/* Telegram Configuration */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Telegram Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive VPS health alerts via Telegram
              </p>
            </div>
            <Switch
              checked={telegramConfig.notificationsEnabled}
              onCheckedChange={(checked) =>
                setTelegramConfig((prev) => ({ ...prev, notificationsEnabled: checked }))
              }
            />
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="botToken">Bot Token</Label>
              <Input
                id="botToken"
                type="password"
                placeholder="Enter Telegram bot token"
                value={telegramConfig.botToken}
                onChange={(e) =>
                  setTelegramConfig((prev) => ({ ...prev, botToken: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chatId">Chat ID</Label>
              <Input
                id="chatId"
                placeholder="Enter your chat ID"
                value={telegramConfig.chatId}
                onChange={(e) =>
                  setTelegramConfig((prev) => ({ ...prev, chatId: e.target.value }))
                }
              />
            </div>
          </div>

          <Button
            variant="outline"
            onClick={testTelegramAlert}
            disabled={isTesting || !telegramConfig.botToken || !telegramConfig.chatId}
          >
            {isTesting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <TestTube className="h-4 w-4 mr-2" />
            )}
            Send Test Alert
          </Button>
        </CardContent>
      </Card>

      {/* Alert Rules */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Alert Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {alertRules.map((rule) => {
              const meta = getAlertMeta(rule.alertType);
              const Icon = meta.icon;
              
              return (
                <div
                  key={rule.alertType}
                  className="p-4 rounded-lg border border-border bg-muted/20"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`p-2 rounded-lg ${rule.isEnabled ? 'bg-primary/20' : 'bg-muted'}`}>
                        <Icon className={`h-4 w-4 ${rule.isEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{meta.label}</span>
                          <Badge variant={rule.isEnabled ? 'default' : 'secondary'} className="text-xs">
                            {rule.isEnabled ? 'Active' : 'Disabled'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {rule.thresholdValue !== null
                            ? `Trigger when exceeds ${rule.thresholdValue}${rule.alertType.includes('latency') ? 'ms' : '%'}`
                            : 'Trigger on event'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {rule.thresholdValue !== null && (
                        <div className="w-20">
                          <Input
                            type="number"
                            value={rule.thresholdValue}
                            onChange={(e) =>
                              updateAlertRule(rule.alertType, {
                                thresholdValue: parseInt(e.target.value) || 0,
                              })
                            }
                            className="text-center"
                            disabled={!rule.isEnabled}
                          />
                        </div>
                      )}
                      <Switch
                        checked={rule.isEnabled}
                        onCheckedChange={(checked) =>
                          updateAlertRule(rule.alertType, { isEnabled: checked })
                        }
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex justify-end">
            <Button onClick={saveConfig} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Configuration
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Alerts */}
      <RecentAlerts />
    </div>
  );
}

function RecentAlerts() {
  const [alerts, setAlerts] = useState<{ id: string; type: string; message: string; severity: string; sentAt: string; acknowledged: boolean }[]>([]);

  useEffect(() => {
    const fetchAlerts = async () => {
      const { data } = await supabase
        .from('alert_history')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(10);

      if (data) {
        setAlerts(data.map((a) => ({
          id: a.id,
          type: a.alert_type,
          message: a.message || '',
          severity: a.severity || 'info',
          sentAt: a.sent_at || '',
          acknowledged: !!a.acknowledged_at,
        })));
      }
    };

    fetchAlerts();
  }, []);

  const acknowledgeAlert = async (id: string) => {
    await supabase
      .from('alert_history')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', id);
    
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
    );
  };

  if (alerts.length === 0) return null;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Recent Alerts</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded-lg flex items-center justify-between ${
                alert.severity === 'error'
                  ? 'bg-destructive/10 border border-destructive/30'
                  : alert.severity === 'warning'
                  ? 'bg-yellow-500/10 border border-yellow-500/30'
                  : 'bg-muted/30 border border-border/50'
              }`}
            >
              <div className="flex items-center gap-3">
                {alert.severity === 'error' ? (
                  <XCircle className="h-4 w-4 text-destructive" />
                ) : alert.severity === 'warning' ? (
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                ) : (
                  <Bell className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium">{alert.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(alert.sentAt).toLocaleString()}
                  </p>
                </div>
              </div>
              {!alert.acknowledged && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => acknowledgeAlert(alert.id)}
                >
                  <CheckCircle className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
