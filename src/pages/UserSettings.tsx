import { useUserSettings } from '@/hooks/useUserSettings';
import { SaveButton } from '@/components/ui/SaveButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Settings, 
  Bell, 
  Palette, 
  Globe, 
  Clock, 
  RefreshCw,
  Volume2,
  LayoutGrid,
  RotateCcw,
  ArrowLeft,
  MessageCircle,
  Mail
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CURRENCIES = ['USDT', 'USD', 'EUR', 'BTC', 'ETH'];
const THEMES = ['dark', 'light', 'system'];
const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
  { value: 'ko', label: '한국어' },
];
const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)' },
  { value: 'America/New_York', label: 'New York (EST)' },
  { value: 'Europe/London', label: 'London (GMT)' },
];

export default function UserSettings() {
  const navigate = useNavigate();
  const { 
    settings, 
    saving, 
    errors, 
    isDirty, 
    status, 
    update, 
    save, 
    reset,
    resetToDefaults 
  } = useUserSettings();

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/')}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Settings className="w-6 h-6 text-primary" />
                User Settings
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage your preferences and notifications
              </p>
            </div>
          </div>
          <SaveButton
            saving={saving}
            isDirty={isDirty}
            status={status}
            onClick={save}
            onCancel={reset}
          />
        </div>

        {/* General Settings */}
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Globe className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">General</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Default Currency */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Default Currency</label>
              <Select
                value={settings.default_currency}
                onValueChange={(v) => update('default_currency', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Theme */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Palette className="w-4 h-4 text-muted-foreground" />
                Theme
              </label>
              <Select
                value={settings.theme}
                onValueChange={(v) => update('theme', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THEMES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Language</label>
              <Select
                value={settings.language}
                onValueChange={(v) => update('language', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Timezone */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Timezone
              </label>
              <Select
                value={settings.timezone}
                onValueChange={(v) => update('timezone', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
              <Bell className="w-5 h-5 text-accent" />
            </div>
            <h2 className="text-lg font-semibold">Notifications</h2>
          </div>

          <div className="space-y-4">
            {/* Master Toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
              <div>
                <p className="font-medium">Enable Notifications</p>
                <p className="text-sm text-muted-foreground">
                  Master toggle for all notifications
                </p>
              </div>
              <Switch
                checked={settings.notifications_enabled}
                onCheckedChange={(v) => update('notifications_enabled', v)}
              />
            </div>

            {/* Telegram Alerts */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-3">
                <MessageCircle className="w-5 h-5 text-[#0088cc]" />
                <div>
                  <p className="font-medium">Telegram Alerts</p>
                  <p className="text-sm text-muted-foreground">
                    Trade alerts and notifications via Telegram
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.telegram_alerts}
                onCheckedChange={(v) => update('telegram_alerts', v)}
                disabled={!settings.notifications_enabled}
              />
            </div>

            {/* Email Alerts */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Email Alerts</p>
                  <p className="text-sm text-muted-foreground">
                    Important updates via email
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.email_alerts}
                onCheckedChange={(v) => update('email_alerts', v)}
                disabled={!settings.notifications_enabled}
              />
            </div>

            {/* Sound Alerts */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-3">
                <Volume2 className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Sound Alerts</p>
                  <p className="text-sm text-muted-foreground">
                    Play sound for trade executions
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.sound_alerts}
                onCheckedChange={(v) => update('sound_alerts', v)}
                disabled={!settings.notifications_enabled}
              />
            </div>

            {/* Daily Report */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
              <div>
                <p className="font-medium">Daily Report</p>
                <p className="text-sm text-muted-foreground">
                  Receive daily summary at 00:00 UTC
                </p>
              </div>
              <Switch
                checked={settings.daily_report_enabled}
                onCheckedChange={(v) => update('daily_report_enabled', v)}
                disabled={!settings.notifications_enabled}
              />
            </div>

            {/* Weekly Report */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
              <div>
                <p className="font-medium">Weekly Report</p>
                <p className="text-sm text-muted-foreground">
                  Receive weekly summary every Monday
                </p>
              </div>
              <Switch
                checked={settings.weekly_report_enabled}
                onCheckedChange={(v) => update('weekly_report_enabled', v)}
                disabled={!settings.notifications_enabled}
              />
            </div>
          </div>
        </div>

        {/* Display Settings */}
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
              <LayoutGrid className="w-5 h-5 text-success" />
            </div>
            <h2 className="text-lg font-semibold">Display</h2>
          </div>

          <div className="space-y-4">
            {/* Auto Refresh Interval */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-3">
                <RefreshCw className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Auto Refresh Interval</p>
                  <p className="text-sm text-muted-foreground">
                    How often to poll for live balance updates
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.auto_refresh_interval}
                  onChange={(e) => update('auto_refresh_interval', parseInt(e.target.value) || 5)}
                  className="w-20 text-center"
                />
                <span className="text-sm text-muted-foreground">sec</span>
              </div>
            </div>
            {errors.auto_refresh_interval && (
              <p className="text-sm text-destructive px-4">{errors.auto_refresh_interval}</p>
            )}

            {/* Compact Mode */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
              <div>
                <p className="font-medium">Compact Mode</p>
                <p className="text-sm text-muted-foreground">
                  Use smaller cards and reduced spacing
                </p>
              </div>
              <Switch
                checked={settings.compact_mode}
                onCheckedChange={(v) => update('compact_mode', v)}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center pt-4">
          <Button
            variant="outline"
            onClick={resetToDefaults}
            className="gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </Button>
          
          <SaveButton
            saving={saving}
            isDirty={isDirty}
            status={status}
            onClick={save}
            onCancel={reset}
          />
        </div>
      </div>
    </div>
  );
}
