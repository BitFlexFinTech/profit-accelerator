import { useState, useEffect } from 'react';
import { 
  MessageCircle, 
  Wallet, 
  Copy, 
  Server, 
  Bell,
  Shield,
  Zap,
  Lock,
  Check,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { TelegramWizard } from '../wizards/TelegramWizard';
import { ExchangeWizard } from '../wizards/ExchangeWizard';
import { TradeCopierWizard } from '../wizards/TradeCopierWizard';
import { IPWhitelistCard } from '../panels/IPWhitelistCard';
import { useTelegramStatus } from '@/hooks/useTelegramStatus';
import { useExchangeStatus } from '@/hooks/useExchangeStatus';
import { useHFTSettings } from '@/hooks/useHFTSettings';
import { toast } from 'sonner';

export function SettingsTab() {
  const [activeWizard, setActiveWizard] = useState<string | null>(null);
  const telegramStatus = useTelegramStatus();
  const exchangeStatus = useExchangeStatus();
  const { settings, setSettings, isLoading, isSaving, saveSettings } = useHFTSettings();

  // Local state for form values
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSaveRiskSettings = async () => {
    await saveSettings({
      risk: localSettings.risk
    });
  };

  const handleSaveLatencySettings = async () => {
    await saveSettings({
      latency: localSettings.latency
    });
  };

  const handleSaveSecuritySettings = async () => {
    await saveSettings({
      security: localSettings.security
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Settings</h2>
      </div>

      {/* One-Click Wizards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <button
          onClick={() => setActiveWizard('telegram')}
          className="glass-card-hover p-6 text-left group"
        >
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 rounded-xl bg-[#0088cc]/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <MessageCircle className="w-6 h-6 text-[#0088cc]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Telegram Bot</h3>
                {telegramStatus.isConnected && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-success/20 text-success flex items-center gap-1">
                    <Check className="w-3 h-3" /> Connected
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">One-click setup</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Get trade alerts, use /kill, /status, /balance commands
          </p>
        </button>

        <button
          onClick={() => setActiveWizard('exchange')}
          className="glass-card-hover p-6 text-left group"
        >
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Wallet className="w-6 h-6 text-accent" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Exchange Connections</h3>
                {exchangeStatus.connectedCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-success/20 text-success">
                    {exchangeStatus.connectedCount}/11
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Connect 11 exchanges</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Bybit, OKX, Bitget, KuCoin, Hyperliquid, Kraken, Nexo...
          </p>
        </button>

        <button
          onClick={() => setActiveWizard('copier')}
          className="glass-card-hover p-6 text-left group"
        >
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Copy className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Trade Copier</h3>
              <p className="text-sm text-muted-foreground">Mirror trades</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Copy trades from master to mirror exchanges automatically
          </p>
        </button>
      </div>

      {/* HFT Cockpit - Risk Management */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h3 className="font-semibold">Risk Management</h3>
            <p className="text-sm text-muted-foreground">Protect your $350 principal</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">Max Daily Drawdown</label>
              <span className="text-sm font-mono text-primary">{localSettings.risk.maxDailyDrawdown}%</span>
            </div>
            <Slider
              value={[localSettings.risk.maxDailyDrawdown]}
              onValueChange={([value]) => setLocalSettings(prev => ({
                ...prev,
                risk: { ...prev.risk, maxDailyDrawdown: value }
              }))}
              max={20}
              min={1}
              step={1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Stop bot if daily loss exceeds this % of principal
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">Max Position Size</label>
              <span className="text-sm font-mono text-primary">${localSettings.risk.maxPositionSize}</span>
            </div>
            <Input
              type="number"
              value={localSettings.risk.maxPositionSize}
              onChange={(e) => setLocalSettings(prev => ({
                ...prev,
                risk: { ...prev.risk, maxPositionSize: Number(e.target.value) }
              }))}
              className="bg-secondary/50"
            />
            <p className="text-xs text-muted-foreground">
              Limit individual trades to this USDT amount
            </p>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-destructive/10 border border-destructive/30">
            <div className="flex items-center gap-3">
              <div className="status-offline" />
              <div>
                <p className="font-medium">Global Kill-Switch</p>
                <p className="text-xs text-muted-foreground">Linked to Telegram /kill command</p>
              </div>
            </div>
            <Switch
              checked={localSettings.risk.globalKillSwitch}
              onCheckedChange={(checked) => setLocalSettings(prev => ({
                ...prev,
                risk: { ...prev.risk, globalKillSwitch: checked }
              }))}
            />
          </div>

          <Button onClick={handleSaveRiskSettings} disabled={isSaving} className="w-full">
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save Risk Settings
          </Button>
        </div>
      </div>

      {/* HFT Cockpit - Tokyo Latency Optimizer */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h3 className="font-semibold">Tokyo Latency Optimizer</h3>
            <p className="text-sm text-muted-foreground">Ultra-low latency HFT settings</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
            <div>
              <p className="font-medium">Regional Routing</p>
              <p className="text-xs text-muted-foreground">Locked to Tokyo for lowest latency</p>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-mono text-accent">ap-northeast-1</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">Execution Buffer</label>
              <span className="text-sm font-mono text-primary">{localSettings.latency.executionBuffer}ms</span>
            </div>
            <Slider
              value={[localSettings.latency.executionBuffer]}
              onValueChange={([value]) => setLocalSettings(prev => ({
                ...prev,
                latency: { ...prev.latency, executionBuffer: value }
              }))}
              max={200}
              min={10}
              step={10}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Time to wait for order confirmation before retry
            </p>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
            <div>
              <p className="font-medium">CORS Proxy Optimization</p>
              <p className="text-xs text-muted-foreground">Faster browser-to-exchange handshakes</p>
            </div>
            <Switch
              checked={localSettings.latency.corsProxy}
              onCheckedChange={(checked) => setLocalSettings(prev => ({
                ...prev,
                latency: { ...prev.latency, corsProxy: checked }
              }))}
            />
          </div>

          <Button onClick={handleSaveLatencySettings} disabled={isSaving} className="w-full">
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save Latency Settings
          </Button>
        </div>
      </div>

      {/* Security & Notifications */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Security & Notifications</h3>
              <p className="text-sm text-muted-foreground">Session and alert settings</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">Session Auto-Lock</label>
                <span className="text-sm font-mono text-primary">{localSettings.security.sessionTimeout} min</span>
              </div>
              <Slider
                value={[localSettings.security.sessionTimeout]}
                onValueChange={([value]) => setLocalSettings(prev => ({
                  ...prev,
                  security: { ...prev.security, sessionTimeout: value }
                }))}
                max={120}
                min={5}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Master password re-entry after idle
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Notify on Trade</p>
                  <p className="text-xs text-muted-foreground">Telegram alerts for trades</p>
                </div>
                <Switch
                  checked={localSettings.security.notifications.notifyOnTrade}
                  onCheckedChange={(checked) => setLocalSettings(prev => ({
                    ...prev,
                    security: { 
                      ...prev.security, 
                      notifications: { ...prev.security.notifications, notifyOnTrade: checked }
                    }
                  }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Notify on Error</p>
                  <p className="text-xs text-muted-foreground">Alert when issues occur</p>
                </div>
                <Switch
                  checked={localSettings.security.notifications.notifyOnError}
                  onCheckedChange={(checked) => setLocalSettings(prev => ({
                    ...prev,
                    security: { 
                      ...prev.security, 
                      notifications: { ...prev.security.notifications, notifyOnError: checked }
                    }
                  }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Daily P&L Report</p>
                  <p className="text-xs text-muted-foreground">End-of-day summary</p>
                </div>
                <Switch
                  checked={localSettings.security.notifications.dailyReport}
                  onCheckedChange={(checked) => setLocalSettings(prev => ({
                    ...prev,
                    security: { 
                      ...prev.security, 
                      notifications: { ...prev.security.notifications, dailyReport: checked }
                    }
                  }))}
                />
              </div>
            </div>

            <Button onClick={handleSaveSecuritySettings} disabled={isSaving} className="w-full">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Security Settings
            </Button>
          </div>
        </div>

        {/* IP Whitelisting Card */}
        <IPWhitelistCard />
      </div>

      {/* VPS Status */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Server className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">VPS Configuration</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-secondary/30">
            <p className="text-muted-foreground text-sm">Region</p>
            <p className="font-medium text-accent">Tokyo (ap-northeast-1)</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary/30">
            <p className="text-muted-foreground text-sm">Status</p>
            <div className="flex items-center gap-2">
              <div className="status-online" />
              <span className="text-success font-medium">Running</span>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-secondary/30">
            <p className="text-muted-foreground text-sm">Provider</p>
            <p className="font-medium">Supabase Edge</p>
          </div>
        </div>
      </div>

      {/* Wizards */}
      <TelegramWizard 
        open={activeWizard === 'telegram'} 
        onOpenChange={(open) => !open && setActiveWizard(null)} 
      />
      <ExchangeWizard 
        open={activeWizard === 'exchange'} 
        onOpenChange={(open) => !open && setActiveWizard(null)} 
      />
      <TradeCopierWizard 
        open={activeWizard === 'copier'} 
        onOpenChange={(open) => !open && setActiveWizard(null)} 
      />
    </div>
  );
}
