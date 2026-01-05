import { useState } from 'react';
import { 
  MessageCircle, 
  Wallet, 
  Copy, 
  Server, 
  Bell,
  Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TelegramWizard } from '../wizards/TelegramWizard';
import { ExchangeWizard } from '../wizards/ExchangeWizard';
import { TradeCopierWizard } from '../wizards/TradeCopierWizard';

export function SettingsTab() {
  const [activeWizard, setActiveWizard] = useState<string | null>(null);

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
              <h3 className="font-semibold">Telegram Bot</h3>
              <p className="text-sm text-muted-foreground">One-click setup</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Get trade alerts, use /kill command, and receive daily summaries
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
              <h3 className="font-semibold">Exchange Connections</h3>
              <p className="text-sm text-muted-foreground">Connect 7 exchanges</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Bybit, OKX, Bitget, BingX, MEXC, Gate.io, Binance
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

      {/* Additional Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Server className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">VPS Configuration</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Region</span>
              <span className="font-medium text-accent">Tokyo (ap-northeast-1)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status</span>
              <div className="flex items-center gap-2">
                <div className="status-online" />
                <span className="text-success">Running</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Monthly Cost</span>
              <span className="font-medium">$25.00</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Notifications</h3>
          </div>
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-muted-foreground">Sound Alerts</span>
              <input type="checkbox" defaultChecked className="w-5 h-5 accent-primary" />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-muted-foreground">Browser Notifications</span>
              <input type="checkbox" defaultChecked className="w-5 h-5 accent-primary" />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-muted-foreground">Telegram Alerts</span>
              <input type="checkbox" defaultChecked className="w-5 h-5 accent-primary" />
            </label>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Security</h3>
        </div>
        <div className="flex gap-4">
          <Button variant="outline">Change Master Password</Button>
          <Button variant="outline">Update Kill Switch Code</Button>
          <Button variant="outline" className="text-destructive hover:text-destructive">
            Lock Command Center
          </Button>
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
