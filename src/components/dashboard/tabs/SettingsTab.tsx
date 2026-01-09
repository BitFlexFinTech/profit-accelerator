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
  Loader2,
  Brain,
  Cloud,
  ArrowLeftRight,
  ArrowRight,
  ArrowLeft,
  Rocket,
  TrendingUp,
  Bot,
  Workflow,
  Terminal,
  Activity,
  Palette
} from 'lucide-react';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { useCloudInfrastructure, PROVIDER_PRICING, PROVIDER_ICONS } from '@/hooks/useCloudInfrastructure';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { TelegramWizard } from '../wizards/TelegramWizard';
import { ExchangeWizard } from '../wizards/ExchangeWizard';
import { TradeCopierWizard } from '../wizards/TradeCopierWizard';
import { GroqWizard } from '../wizards/GroqWizard';
import { ContaboWizard } from '../wizards/ContaboWizard';
import { VultrWizard } from '../wizards/VultrWizard';
import { AWSWizard } from '../wizards/AWSWizard';
import { DigitalOceanWizard } from '../wizards/DigitalOceanWizard';
import { GCPWizard } from '../wizards/GCPWizard';
import { OracleWizard } from '../wizards/OracleWizard';
import { AlibabaWizard } from '../wizards/AlibabaWizard';
import { AzureWizard } from '../wizards/AzureWizard';
import { SecurityHardeningWizard } from '../wizards/SecurityHardeningWizard';
import { FreqtradeWizard } from '../wizards/FreqtradeWizard';
import { HummingbotWizard } from '../wizards/HummingbotWizard';
import { OctoBotWizard } from '../wizards/OctoBotWizard';
import { JesseWizard } from '../wizards/JesseWizard';
import { IPWhitelistCard } from '../panels/IPWhitelistCard';
import { SecurityVaultPanel } from '../panels/SecurityVaultPanel';
import { LatencyComparisonChart } from '../panels/LatencyComparisonChart';
import { LatencyHistoryChart } from '../panels/LatencyHistoryChart';
import { AIProviderRankingPanel } from '../panels/AIProviderRankingPanel';
import { useTelegramStatus } from '@/hooks/useTelegramStatus';
import { useExchangeStatus } from '@/hooks/useExchangeStatus';
import { useHFTSettings } from '@/hooks/useHFTSettings';
import { useAIConfig } from '@/hooks/useAIConfig';
import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

// Region code to display name mapping
const REGION_NAMES: Record<string, string> = {
  'nrt': 'Tokyo',
  'sgp': 'Singapore',
  'lax': 'Los Angeles',
  'ewr': 'New Jersey',
  'fra': 'Frankfurt',
  'lhr': 'London',
  'ams': 'Amsterdam',
  'syd': 'Sydney',
  'ap-northeast-1': 'Tokyo',
  'ap-southeast-1': 'Singapore',
  'us-west-1': 'California',
  'us-east-1': 'Virginia',
  'eu-west-1': 'Ireland',
  'asia-northeast1': 'Tokyo',
  'asia-southeast1': 'Singapore',
};

function getRegionDisplayName(regionCode: string | undefined): string {
  if (!regionCode) return 'Unknown';
  return REGION_NAMES[regionCode] || regionCode;
}

// Cloud Provider Configuration
const CLOUD_PROVIDERS = [
  { id: 'contabo', name: 'Contabo', region: 'Singapore', icon: '🌏', wizard: 'contabo' },
  { id: 'vultr', name: 'Vultr', region: 'Tokyo NRT', icon: '🦅', wizard: 'vultr' },
  { id: 'aws', name: 'AWS', region: 'Tokyo ap-northeast-1', icon: '☁️', wizard: 'aws' },
  { id: 'digitalocean', name: 'DigitalOcean', region: 'Singapore SGP1', icon: '🌊', wizard: 'digitalocean' },
  { id: 'gcp', name: 'GCP', region: 'Tokyo asia-northeast1', icon: '🔵', wizard: 'gcp', free: true },
  { id: 'oracle', name: 'Oracle', region: 'Tokyo ap-tokyo-1', icon: '🔴', wizard: 'oracle', free: true },
  { id: 'alibaba', name: 'Alibaba', region: 'Tokyo ap-northeast-1', icon: '🟠', wizard: 'alibaba' },
  { id: 'azure', name: 'Azure', region: 'Japan East', icon: '💠', wizard: 'azure', free: true },
];

// VPS Status Section Component
function VPSStatusSection() {
  const { vps } = useSystemStatus();
  
  const isConnected = vps.status === 'running' || vps.status === 'idle';
  const statusText = vps.status === 'running' ? 'Running' : 
                     vps.status === 'idle' ? 'Connected (Idle)' : 
                     vps.status === 'deploying' ? 'Deploying...' : 'Inactive';
  const statusClass = vps.status === 'running' ? 'text-success' : 
                      vps.status === 'idle' ? 'text-primary' : 
                      vps.status === 'deploying' ? 'text-warning' : 'text-muted-foreground';
  
  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <Server className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">VPS Configuration</h3>
      </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-secondary/30">
          <p className="text-muted-foreground text-sm">Region</p>
          <p className="font-medium text-accent">{getRegionDisplayName(vps.region)} ({vps.region || 'N/A'})</p>
        </div>
        <div className="p-4 rounded-lg bg-secondary/30">
          <p className="text-muted-foreground text-sm">Status</p>
          <div className="flex items-center gap-2">
            <div className={isConnected ? 'status-online' : 'status-offline'} />
            <span className={`font-medium ${statusClass}`}>{statusText}</span>
          </div>
        </div>
        <div className="p-4 rounded-lg bg-secondary/30">
          <p className="text-muted-foreground text-sm">IP Address</p>
          <p className="font-medium font-mono text-sm">{vps.ip || 'Not configured'}</p>
        </div>
        <div className="p-4 rounded-lg bg-secondary/30">
          <p className="text-muted-foreground text-sm">Provider</p>
          <p className="font-medium">{vps.provider ? vps.provider.charAt(0).toUpperCase() + vps.provider.slice(1) : 'Not set'}</p>
        </div>
      </div>
    </div>
  );
}

// Wallet Transfer Section Component  
function WalletTransferSection() {
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [selectedExchange, setSelectedExchange] = useState<'Binance' | 'OKX'>('Binance');
  const exchangeStatus = useExchangeStatus();

  const handleTransfer = async (from: 'spot' | 'futures', to: 'spot' | 'futures') => {
    if (!transferAmount || parseFloat(transferAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setIsTransferring(true);
    try {
      const { data, error } = await supabase.functions.invoke('trade-engine', {
        body: {
          action: 'wallet-transfer',
          exchange: selectedExchange,
          from,
          to,
          amount: parseFloat(transferAmount),
          asset: 'USDT'
        }
      });

      if (error) throw error;
      
      toast.success(`Transferred ${transferAmount} USDT from ${from} to ${to}`);
      setTransferAmount('');
    } catch (err: any) {
      toast.error(`Transfer failed: ${err.message}`);
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <ArrowLeftRight className="w-5 h-5 text-accent" />
        <h3 className="font-semibold">Wallet Transfers</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Move funds between Spot and Futures wallets
      </p>
      
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedExchange('Binance')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedExchange === 'Binance' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-secondary/50 hover:bg-secondary'
            }`}
          >
            Binance
          </button>
          <button
            onClick={() => setSelectedExchange('OKX')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedExchange === 'OKX' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-secondary/50 hover:bg-secondary'
            }`}
          >
            OKX
          </button>
        </div>
        
        <div className="flex gap-2 items-center">
          <Input
            type="number"
            placeholder="Amount USDT"
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
            className="max-w-[150px]"
          />
          <span className="text-sm text-muted-foreground">USDT</span>
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={() => handleTransfer('spot', 'futures')}
            disabled={isTransferring}
            variant="outline"
            className="flex-1"
          >
            {isTransferring ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
            Move to Futures
          </Button>
          <Button
            onClick={() => handleTransfer('futures', 'spot')}
            disabled={isTransferring}
            variant="outline"
            className="flex-1"
          >
            {isTransferring ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowLeft className="w-4 h-4 mr-2" />}
            Move to Spot
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SettingsTab() {
  const [activeWizard, setActiveWizard] = useState<string | null>(null);
  const [isDeployingMesh, setIsDeployingMesh] = useState(false);
  const telegramStatus = useTelegramStatus();
  const exchangeStatus = useExchangeStatus();
  const { settings, setSettings, isLoading, isSaving, saveSettings } = useHFTSettings();
  const { config: aiConfig, isActive: aiIsActive } = useAIConfig();
  const { vps } = useSystemStatus();
  const { 
    providers, 
    bestValueProvider, 
    totalMonthlyCost, 
    meshHealthScore,
    refresh: refreshCloudData
  } = useCloudInfrastructure();

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

  const handleDeployTokyoMesh = async () => {
    setIsDeployingMesh(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-provision-mesh', {
        body: { action: 'deploy-all' }
      });
      
      if (error) throw error;
      
      toast.success('Tokyo Mesh deployment initiated! Check timeline for progress.');
      refreshCloudData();
    } catch (err: any) {
      toast.error(`Mesh deployment failed: ${err.message}`);
    } finally {
      setIsDeployingMesh(false);
    }
  };

  // Get provider status from cloud infrastructure data
  const getProviderStatus = (providerId: string) => {
    const provider = providers.find(p => p.provider === providerId);
    if (!provider) return { status: 'ready', latency: null, isPrimary: false };
    return {
      status: provider.status,
      latency: provider.latency_ms,
      isPrimary: provider.is_primary
    };
  };

  const isVpsConnected = vps.status === 'running' || vps.status === 'idle';
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Settings</h2>
        
        {/* Theme Toggle */}
        <div className="flex items-center gap-3 p-2 px-4 rounded-lg bg-secondary/30 border border-border/50">
          <Palette className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Theme</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTheme('colorful')}
              className={`px-3 py-1.5 text-xs rounded transition-all ${
                theme === 'colorful' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title="Deep navy with vibrant neon accents"
            >
              🌃 Neon Nights
            </button>
            <button
              onClick={() => setTheme('bw')}
              className={`px-3 py-1.5 text-xs rounded transition-all ${
                theme === 'bw' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title="Pure black and white, no distractions"
            >
              🎬 Noir Mode
            </button>
            <button
              onClick={() => setTheme('light')}
              className={`px-3 py-1.5 text-xs rounded transition-all ${
                theme === 'light' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title="Bright white with vibrant flat colors"
            >
              ☀️ Sunshine Pop
            </button>
          </div>
        </div>
      </div>

      {/* One-Click Wizards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
            Get trade alerts, /analyze, /kill commands
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
                <h3 className="font-semibold">Exchanges</h3>
                {exchangeStatus.connectedCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-success/20 text-success">
                    {exchangeStatus.connectedCount}/11
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">11 exchanges</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Bybit, OKX, KuCoin, Hyperliquid...
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
            Copy trades between exchanges
          </p>
        </button>

        <button
          onClick={() => setActiveWizard('groq')}
          className="glass-card-hover p-6 text-left group"
        >
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Brain className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">AI (Groq)</h3>
                {aiIsActive && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-success/20 text-success flex items-center gap-1">
                    <Check className="w-3 h-3" /> Active
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Trade analysis</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            AI-powered sentiment via Telegram
          </p>
        </button>
      </div>

      {/* AI Analysis Engine Section */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Brain className="w-5 h-5 text-purple-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">AI Analysis Engine (Groq)</h3>
            <p className="text-sm text-muted-foreground">Get AI-powered trade sentiment analysis via Telegram</p>
          </div>
          {aiIsActive ? (
            <span className="px-3 py-1 rounded-full bg-success/20 text-success text-sm font-medium flex items-center gap-2">
              <Check className="w-4 h-4" /> AI Analysis Active
            </span>
          ) : (
            <Button onClick={() => setActiveWizard('groq')} size="sm">
              Configure
            </Button>
          )}
        </div>

        {aiIsActive && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-muted-foreground text-sm">Provider</p>
              <p className="font-medium">Groq</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-muted-foreground text-sm">Model</p>
              <p className="font-medium font-mono text-sm">{aiConfig?.model || 'llama-3.3-70b-versatile'}</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-muted-foreground text-sm">Telegram Commands</p>
              <p className="font-medium font-mono text-sm">/analyze BTC, /analyze ETH</p>
            </div>
          </div>
        )}
      </div>

      {/* AI Provider Performance Ranking */}
      <AIProviderRankingPanel />

      {/* Cloud Infrastructure Section - 8 Provider Grid */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
            <Cloud className="w-5 h-5 text-sky-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">Cloud Infrastructure</h3>
            <p className="text-sm text-muted-foreground">Deploy HFT bots across 8 cloud providers</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Mesh Health</p>
              <p className="font-mono text-sm font-semibold text-success">{meshHealthScore}%</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Monthly Cost</p>
              <p className="font-mono text-sm font-semibold">${totalMonthlyCost.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Quick Deploy Recommendation Banner */}
        {bestValueProvider && (
          <div className="mb-6 p-4 rounded-lg bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-primary" />
                <div>
                    <p className="font-medium text-sm">Recommended: {PROVIDER_ICONS[bestValueProvider.provider]} {PROVIDER_PRICING[bestValueProvider.provider]?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {bestValueProvider.latency_ms?.toFixed(0) || '—'}ms latency • 
                      {PROVIDER_PRICING[bestValueProvider.provider]?.free ? ' FREE tier' : ` $${PROVIDER_PRICING[bestValueProvider.provider]?.monthly}/mo`}
                    </p>
                  </div>
                </div>
              <Button 
                size="sm" 
                onClick={() => setActiveWizard(bestValueProvider.provider)}
                className="bg-primary hover:bg-primary/90"
              >
                <Rocket className="w-4 h-4 mr-2" />
                Quick Deploy
              </Button>
            </div>
          </div>
        )}

        {/* 8 Provider Grid (4x2) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {CLOUD_PROVIDERS.map((provider) => {
            const providerStatus = getProviderStatus(provider.id);
            const pricing = PROVIDER_PRICING[provider.id];
            // Check both useCloudInfrastructure and useSystemStatus for connected state
            const isConnected = providerStatus.status === 'running' || 
                               (provider.id === vps.provider && (vps.status === 'running' || vps.status === 'idle'));
            // Only show PRIMARY badge for the actual running VPS, not failover_config.is_primary
            const isActiveVps = provider.id === vps.provider && 
                               (vps.status === 'running' || vps.status === 'idle');
            const isPrimary = isActiveVps;

            return (
              <button
                key={provider.id}
                onClick={() => setActiveWizard(provider.wizard)}
                className={`p-4 rounded-lg text-left group relative transition-all duration-200 ${
                  isPrimary 
                    ? 'bg-primary/20 border-2 border-primary/50 hover:bg-primary/30' 
                    : isConnected
                      ? 'bg-success/10 border border-success/30 hover:bg-success/20'
                      : 'bg-secondary/30 hover:bg-secondary/50 border border-transparent'
                }`}
              >
                {/* Status Indicator with Pulse */}
                <div className="absolute -top-2 -right-2 flex items-center gap-1">
                  {isConnected && (
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-success" />
                    </span>
                  )}
                  {isPrimary && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-medium">
                      PRIMARY
                    </span>
                  )}
                  {isConnected && !isPrimary && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-success/20 text-success font-medium">
                      Running
                    </span>
                  )}
                  {pricing?.free && !isConnected && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent font-medium">
                      FREE
                    </span>
                  )}
                </div>

                {/* Provider Icon & Name */}
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl group-hover:scale-110 transition-transform">{provider.icon}</span>
                  <div>
                    <p className="font-medium">{provider.name}</p>
                    <p className="text-xs text-muted-foreground">{provider.region}</p>
                  </div>
                </div>

                {/* Latency & Cost */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                  <div className="text-xs">
                    <span className="text-muted-foreground">{isActiveVps ? 'VPS→Exch: ' : 'Latency: '}</span>
                    <span className={`font-mono ${providerStatus.latency ? (providerStatus.latency < 30 ? 'text-success' : providerStatus.latency < 80 ? 'text-warning' : 'text-destructive') : 'text-muted-foreground'}`}>
                      {providerStatus.latency ? `${Math.round(providerStatus.latency)}ms` : '—'}
                    </span>
                    {isActiveVps && (
                      <span className="text-muted-foreground ml-1 text-[10px]" title="VPS to Exchange latency - what matters for trading">
                        (trade speed)
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono">
                    {pricing?.free ? (
                      <span className="text-accent font-medium">FREE</span>
                    ) : (
                      <span className="text-muted-foreground">${pricing?.monthly}/mo</span>
                    )}
                  </div>
                </div>
                {/* Refresh button for connected providers */}
                {isConnected && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full mt-2 text-xs h-7"
                    onClick={async (e) => {
                      e.stopPropagation();
                      toast.info(`Refreshing ${provider.name} latency...`);
                      try {
                        await supabase.functions.invoke('check-vps-health');
                        await refreshCloudData();
                        toast.success(`${provider.name} latency updated`);
                      } catch (err) {
                        toast.error('Failed to refresh latency');
                      }
                    }}
                  >
                    <Loader2 className="w-3 h-3 mr-1" />
                    Refresh Latency
                  </Button>
                )}
              </button>
            );
          })}
        </div>

        {/* Deploy Tokyo Mesh Button */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-accent/10 to-primary/10 border border-accent/20">
          <div>
            <p className="font-medium">Deploy Tokyo Mesh</p>
            <p className="text-xs text-muted-foreground">Deploy to all configured providers simultaneously with auto-failover</p>
          </div>
          <Button 
            onClick={handleDeployTokyoMesh}
            disabled={isDeployingMesh}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            {isDeployingMesh ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Rocket className="w-4 h-4 mr-2" />
            )}
            {isDeployingMesh ? 'Deploying...' : 'Deploy Mesh'}
          </Button>
        </div>
      </div>

      {/* Trading Bot Frameworks */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">Trading Bot Frameworks</h3>
            <p className="text-sm text-muted-foreground">Deploy open-source trading bots to your VPS</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            onClick={() => setActiveWizard('freqtrade')}
            className="p-4 rounded-lg bg-sky-500/10 border border-sky-500/30 hover:bg-sky-500/20 text-left group transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <Bot className="w-6 h-6 text-sky-400" />
              <span className="font-medium">Freqtrade</span>
            </div>
            <p className="text-xs text-muted-foreground">Python HFT Bot</p>
          </button>
          
          <button
            onClick={() => setActiveWizard('hummingbot')}
            className="p-4 rounded-lg bg-teal-500/10 border border-teal-500/30 hover:bg-teal-500/20 text-left group transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <Workflow className="w-6 h-6 text-teal-400" />
              <span className="font-medium">Hummingbot</span>
            </div>
            <p className="text-xs text-muted-foreground">Market Making</p>
          </button>
          
          <button
            onClick={() => setActiveWizard('octobot')}
            className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-left group transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <Terminal className="w-6 h-6 text-red-400" />
              <span className="font-medium">OctoBot</span>
            </div>
            <p className="text-xs text-muted-foreground">Web UI Bot</p>
          </button>
          
          <button
            onClick={() => setActiveWizard('jesse')}
            className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 text-left group transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <Activity className="w-6 h-6 text-blue-400" />
              <span className="font-medium">Jesse</span>
            </div>
            <p className="text-xs text-muted-foreground">Algo Research</p>
          </button>
        </div>
      </div>

      {/* HFT Cockpit - Risk Management */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h3 className="font-semibold">Risk Management</h3>
            <p className="text-sm text-muted-foreground">Protect your capital</p>
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
            <h3 className="font-semibold">Latency Optimizer</h3>
            <p className="text-sm text-muted-foreground">Ultra-low latency HFT settings</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
            <div>
              <p className="font-medium">Regional Routing</p>
              <p className="text-xs text-muted-foreground">
                {isVpsConnected 
                  ? `Connected to ${getRegionDisplayName(vps.region)} VPS`
                  : 'No VPS connected - configure in Cloud Infrastructure'
                }
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isVpsConnected ? (
                <>
                  <div className="status-online" />
                  <span className="text-sm font-mono text-accent">{vps.region || 'unknown'}</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-mono text-muted-foreground">Not configured</span>
                </>
              )}
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

      {/* Latency Analytics Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <LatencyComparisonChart />
        <LatencyHistoryChart />
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

      {/* VPS Status - Dynamic */}
      <VPSStatusSection />

      {/* Security Vault - Encryption Key Management */}
      <SecurityVaultPanel />

      {/* Wallet Transfers */}
      <WalletTransferSection />

      {/* All Wizards */}
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
      <GroqWizard 
        open={activeWizard === 'groq'} 
        onOpenChange={(open) => !open && setActiveWizard(null)} 
      />
      <ContaboWizard 
        open={activeWizard === 'contabo'} 
        onOpenChange={(open) => !open && setActiveWizard(null)} 
      />
      <VultrWizard 
        open={activeWizard === 'vultr'} 
        onOpenChange={(open) => !open && setActiveWizard(null)} 
      />
      <AWSWizard 
        open={activeWizard === 'aws'} 
        onOpenChange={(open) => !open && setActiveWizard(null)} 
      />
      <DigitalOceanWizard 
        open={activeWizard === 'digitalocean'} 
        onOpenChange={(open) => !open && setActiveWizard(null)} 
      />
      <GCPWizard 
        open={activeWizard === 'gcp'} 
        onOpenChange={(open) => !open && setActiveWizard(null)} 
      />
      <OracleWizard 
        open={activeWizard === 'oracle'} 
        onOpenChange={(open) => !open && setActiveWizard(null)} 
      />
      <AlibabaWizard 
        open={activeWizard === 'alibaba'} 
        onOpenChange={(open) => !open && setActiveWizard(null)} 
      />
      <AzureWizard 
        open={activeWizard === 'azure'} 
        onOpenChange={(open) => !open && setActiveWizard(null)} 
      />
      <SecurityHardeningWizard 
        open={activeWizard === 'security-hardening'} 
        onOpenChange={(open) => !open && setActiveWizard(null)} 
      />
      <FreqtradeWizard 
        open={activeWizard === 'freqtrade'} 
        onOpenChange={(open) => !open && setActiveWizard(null)} 
      />
      <HummingbotWizard 
        open={activeWizard === 'hummingbot'} 
        onOpenChange={(open) => !open && setActiveWizard(null)} 
      />
      <OctoBotWizard 
        open={activeWizard === 'octobot'} 
        onOpenChange={(open) => !open && setActiveWizard(null)} 
      />
      <JesseWizard 
        open={activeWizard === 'jesse'} 
        onOpenChange={(open) => !open && setActiveWizard(null)} 
      />
    </div>
  );
}
