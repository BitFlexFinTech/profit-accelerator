import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Check, Eye, EyeOff, RefreshCw, Zap, 
  Server, Globe, Shield, BookOpen, Trash2, Save, Loader2, Brain,
  Sparkles, Cpu, Users, Wind
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CloudKeyGuideModal } from '@/components/dashboard/wizards/CloudKeyGuideModal';
import { ExchangePulsePanel } from '@/components/dashboard/panels/ExchangePulsePanel';
import { VPSHealthMonitor } from '@/components/dashboard/panels/VPSHealthMonitor';
import { GeminiWizard } from '@/components/dashboard/wizards/GeminiWizard';
import { CerebrasWizard } from '@/components/dashboard/wizards/CerebrasWizard';
import { TogetherWizard } from '@/components/dashboard/wizards/TogetherWizard';
import { OpenRouterWizard } from '@/components/dashboard/wizards/OpenRouterWizard';
import { MistralWizard } from '@/components/dashboard/wizards/MistralWizard';

interface CloudProvider {
  id: string;
  name: string;
  shortName: string;
  colorClass: string;
  borderClass: string;
  region: string;
  apiKeyField: string;
  secretField: string | null;
  hasSecret: boolean;
}

interface AIProvider {
  id: string;
  name: string;
  shortName: string;
  colorHex: string;
  colorClass: string;
  borderClass: string;
  rateLimitRpm: number;
  getKeyUrl: string;
  freeTierInfo: string;
  icon: 'brain' | 'sparkles' | 'cpu' | 'users' | 'globe' | 'wind';
}

const CLOUD_PROVIDERS: CloudProvider[] = [
  { id: 'aws', name: 'Amazon Web Services', shortName: 'AWS', colorClass: 'bg-orange-500/20', borderClass: 'border-orange-500', region: 'ap-northeast-1', apiKeyField: 'accessKeyId', secretField: 'secretAccessKey', hasSecret: true },
  { id: 'digitalocean', name: 'DigitalOcean', shortName: 'DO', colorClass: 'bg-sky-400/20', borderClass: 'border-sky-400', region: 'sgp1', apiKeyField: 'apiToken', secretField: null, hasSecret: false },
  { id: 'vultr', name: 'Vultr', shortName: 'Vultr', colorClass: 'bg-yellow-400/20', borderClass: 'border-yellow-400', region: 'nrt', apiKeyField: 'apiKey', secretField: null, hasSecret: false },
  { id: 'contabo', name: 'Contabo', shortName: 'Contabo', colorClass: 'bg-pink-500/20', borderClass: 'border-pink-500', region: 'SIN', apiKeyField: 'clientId', secretField: 'clientSecret', hasSecret: true },
  { id: 'oracle', name: 'Oracle Cloud', shortName: 'Oracle', colorClass: 'bg-red-500/20', borderClass: 'border-red-500', region: 'ap-tokyo-1', apiKeyField: 'tenancyOcid', secretField: 'privateKey', hasSecret: true },
  { id: 'gcp', name: 'Google Cloud', shortName: 'GCP', colorClass: 'bg-green-400/20', borderClass: 'border-green-400', region: 'asia-northeast1', apiKeyField: 'projectId', secretField: 'serviceAccountKey', hasSecret: true },
  { id: 'alibaba', name: 'Alibaba Cloud', shortName: 'Alibaba', colorClass: 'bg-purple-500/20', borderClass: 'border-purple-500', region: 'ap-northeast-1', apiKeyField: 'accessKeyId', secretField: 'accessKeySecret', hasSecret: true },
  { id: 'azure', name: 'Microsoft Azure', shortName: 'Azure', colorClass: 'bg-teal-500/20', borderClass: 'border-teal-500', region: 'japaneast', apiKeyField: 'subscriptionId', secretField: 'clientSecret', hasSecret: true },
];

const AI_PROVIDERS: AIProvider[] = [
  { id: 'groq', name: 'Groq (Ultra Fast)', shortName: 'Groq', colorHex: '#F55036', colorClass: 'bg-red-500/20', borderClass: 'border-red-500', rateLimitRpm: 30, getKeyUrl: 'https://console.groq.com/keys', freeTierInfo: '30 RPM', icon: 'brain' },
  { id: 'gemini', name: 'Google Gemini', shortName: 'Gemini', colorHex: '#4285F4', colorClass: 'bg-blue-500/20', borderClass: 'border-blue-500', rateLimitRpm: 15, getKeyUrl: 'https://aistudio.google.com/app/apikey', freeTierInfo: '15 RPM', icon: 'sparkles' },
  { id: 'cerebras', name: 'Cerebras (Fast)', shortName: 'Cerebras', colorHex: '#00D4AA', colorClass: 'bg-teal-500/20', borderClass: 'border-teal-500', rateLimitRpm: 30, getKeyUrl: 'https://cloud.cerebras.ai', freeTierInfo: '30 RPM', icon: 'cpu' },
  { id: 'together', name: 'Together AI', shortName: 'Together', colorHex: '#FF6B35', colorClass: 'bg-orange-500/20', borderClass: 'border-orange-500', rateLimitRpm: 60, getKeyUrl: 'https://api.together.xyz', freeTierInfo: '60 RPM', icon: 'users' },
  { id: 'openrouter', name: 'OpenRouter', shortName: 'OpenRouter', colorHex: '#9B59B6', colorClass: 'bg-purple-500/20', borderClass: 'border-purple-500', rateLimitRpm: 20, getKeyUrl: 'https://openrouter.ai/keys', freeTierInfo: '20 RPM', icon: 'globe' },
  { id: 'mistral', name: 'Mistral AI', shortName: 'Mistral', colorHex: '#FF7000', colorClass: 'bg-amber-500/20', borderClass: 'border-amber-500', rateLimitRpm: 30, getKeyUrl: 'https://console.mistral.ai', freeTierInfo: '30 RPM', icon: 'wind' },
];

interface CloudCredentials {
  [key: string]: {
    apiKey: string;
    secret: string;
    isComplete: boolean;
    isSaving?: boolean;
    isActive: boolean;
  };
}

interface AICredentials {
  [key: string]: {
    apiKey: string;
    isEnabled: boolean;
    isActive: boolean;
    currentUsage: number;
    isSaving?: boolean;
  };
}

export default function Setup() {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState<CloudCredentials>({});
  const [aiCredentials, setAICredentials] = useState<AICredentials>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [incompleteProviders, setIncompleteProviders] = useState<string[]>([]);
  const [activeWizard, setActiveWizard] = useState<string | null>(null);

  useEffect(() => {
    fetchExistingCredentials();
    fetchAIProviders();
  }, []);

  const fetchAIProviders = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_providers')
        .select('*');

      if (error) throw error;

      const creds: AICredentials = {};
      for (const provider of AI_PROVIDERS) {
        const existing = data?.find(d => d.provider_name === provider.id);
        creds[provider.id] = {
          apiKey: '',
          isEnabled: existing?.is_enabled || false,
          isActive: existing?.is_active || false,
          currentUsage: existing?.current_usage || 0,
        };
      }
      setAICredentials(creds);
    } catch (err) {
      console.error('Error fetching AI providers:', err);
    }
  };

  const handleSaveAIRow = async (providerId: string) => {
    const cred = aiCredentials[providerId];
    if (!cred?.apiKey) {
      toast.error('Please enter API key first');
      return;
    }

    setAICredentials(prev => ({
      ...prev,
      [providerId]: { ...prev[providerId], isSaving: true }
    }));

    try {
      const { error } = await supabase
        .from('ai_providers')
        .update({
          is_enabled: true,
          is_active: true,
          has_secret: true,
        })
        .eq('provider_name', providerId);

      if (error) throw error;

      const provider = AI_PROVIDERS.find(p => p.id === providerId);
      toast.success(`${provider?.shortName} enabled! Add ${provider?.id.toUpperCase()}_API_KEY to Supabase secrets.`);

      setAICredentials(prev => ({
        ...prev,
        [providerId]: { ...prev[providerId], isSaving: false, isEnabled: true, isActive: true }
      }));
    } catch (err: any) {
      toast.error(`Failed to save: ${err.message}`);
      setAICredentials(prev => ({
        ...prev,
        [providerId]: { ...prev[providerId], isSaving: false }
      }));
    }
  };

  const getAIIcon = (icon: string) => {
    switch (icon) {
      case 'brain': return <Brain className="w-4 h-4" />;
      case 'sparkles': return <Sparkles className="w-4 h-4" />;
      case 'cpu': return <Cpu className="w-4 h-4" />;
      case 'users': return <Users className="w-4 h-4" />;
      case 'globe': return <Globe className="w-4 h-4" />;
      case 'wind': return <Wind className="w-4 h-4" />;
      default: return <Brain className="w-4 h-4" />;
    }
  };

  const fetchExistingCredentials = async () => {
    try {
      const { data, error } = await supabase
        .from('cloud_config')
        .select('*');

      if (error) throw error;

      const creds: CloudCredentials = {};
      for (const provider of CLOUD_PROVIDERS) {
        const existing = data?.find(d => d.provider.toLowerCase() === provider.id.toLowerCase());
        const existingCreds = existing?.credentials as Record<string, string> | null;
        
        // Mask saved credentials for display (show last 4 chars only)
        const savedApiKey = existingCreds?.[provider.apiKeyField];
        const savedSecret = existingCreds?.[provider.secretField || ''];
        
        creds[provider.id] = {
          apiKey: savedApiKey ? `••••••••${savedApiKey.slice(-4)}` : '',
          secret: provider.hasSecret ? (savedSecret ? `••••••••${savedSecret.slice(-4)}` : '') : '',
          isComplete: !!savedApiKey,
          isActive: existing?.is_active || false,
          isSaving: false,
        };
      }
      setCredentials(creds);
    } catch (err) {
      console.error('Error fetching credentials:', err);
    }
  };

  const handleCredentialChange = (providerId: string, field: 'apiKey' | 'secret', value: string) => {
    setCredentials(prev => {
      const provider = CLOUD_PROVIDERS.find(p => p.id === providerId);
      const updated = {
        ...prev,
        [providerId]: {
          ...prev[providerId],
          [field]: value,
        }
      };
      
      // Check if complete
      const apiKeyFilled = updated[providerId].apiKey.length > 0;
      const secretFilled = !provider?.hasSecret || updated[providerId].secret.length > 0;
      updated[providerId].isComplete = apiKeyFilled && secretFilled;
      
      return updated;
    });
  };

  const handleSaveRow = async (providerId: string) => {
    const provider = CLOUD_PROVIDERS.find(p => p.id === providerId);
    const cred = credentials[providerId];
    
    if (!provider || !cred?.apiKey) {
      toast.error('Please enter API key first');
      return;
    }
    
    if (provider.hasSecret && !cred?.secret) {
      toast.error('Please enter API secret');
      return;
    }
    
    // Set saving state
    setCredentials(prev => ({
      ...prev,
      [providerId]: { ...prev[providerId], isSaving: true }
    }));
    
    try {
      const credentialsObj: Record<string, string> = {
        [provider.apiKeyField]: cred.apiKey,
      };
      if (provider.hasSecret && provider.secretField) {
        credentialsObj[provider.secretField] = cred.secret;
      }

      const { error } = await supabase.from('cloud_config').upsert({
        provider: provider.id,
        region: provider.region,
        credentials: credentialsObj,
        is_active: false,
        status: 'configured',
        updated_at: new Date().toISOString()
      }, { onConflict: 'provider' });

      if (error) throw error;

      toast.success(`${provider.shortName} credentials saved successfully`);
      
      // Refresh credentials from database to ensure sync
      await fetchExistingCredentials();
      
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error(`Failed to save ${provider.shortName}: ${err.message}`);
      setCredentials(prev => ({
        ...prev,
        [providerId]: { ...prev[providerId], isSaving: false }
      }));
    }
  };

  const handleConnectAll = async () => {
    // Check for incomplete providers
    const incomplete: string[] = [];
    for (const provider of CLOUD_PROVIDERS) {
      const cred = credentials[provider.id];
      if (!cred?.apiKey || (provider.hasSecret && !cred?.secret)) {
        incomplete.push(provider.id);
      }
    }

    if (incomplete.length > 0) {
      setIncompleteProviders(incomplete);
      setShowGuideModal(true);
      return;
    }

    setIsConnecting(true);
    try {
      let successCount = 0;
      let failCount = 0;

      // Deploy each provider with real API
      for (const provider of CLOUD_PROVIDERS) {
        const cred = credentials[provider.id];
        if (!cred?.apiKey) continue;

        // Save credentials first
        const credentialsObj: Record<string, string> = {
          [provider.apiKeyField]: cred.apiKey,
        };
        if (provider.hasSecret && provider.secretField) {
          credentialsObj[provider.secretField] = cred.secret;
        }

        await supabase.from('cloud_config').upsert({
          provider: provider.id,
          region: provider.region,
          credentials: credentialsObj,
          is_active: false,
          status: 'provisioning',
        }, { onConflict: 'provider' });

        // Call real provisioning endpoint
        try {
          const { data, error } = await supabase.functions.invoke('provision-vps', {
            body: { 
              provider: provider.id,
              targetExchange: 'binance', // Default to Tokyo mesh
              credentials: credentialsObj
            }
          });

          if (error || !data?.success) {
            console.error(`[Setup] ${provider.id} deploy failed:`, error || data?.error);
            failCount++;
          } else {
            successCount++;
            toast.success(`${provider.shortName} deployed: ${data.publicIp || 'Provisioning...'}`);
            
            // Update local state
            setCredentials(prev => ({
              ...prev,
              [provider.id]: {
                ...prev[provider.id],
                isActive: true,
              }
            }));
          }
        } catch (deployError) {
          console.error(`[Setup] ${provider.id} deploy error:`, deployError);
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully deployed ${successCount} VPS instances!`);
      }
      if (failCount > 0) {
        toast.warning(`${failCount} providers failed - check API keys`);
      }
    } catch (err) {
      console.error('Connect all error:', err);
      toast.error('Failed to connect providers');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCleanSlate = async () => {
    setIsAuditing(true);
    try {
      // Reset cloud_config statuses
      await supabase
        .from('cloud_config')
        .update({ status: 'not_configured', is_active: false })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      // Clear stale failover entries
      await supabase
        .from('failover_config')
        .update({ consecutive_failures: 0, is_primary: false })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      // Log audit
      await supabase.from('audit_logs').insert({
        action: 'clean_slate',
        entity_type: 'cloud_config',
        new_value: { message: 'All cloud configs reset for fresh deployment' }
      });

      toast.success('Clean slate completed - ready for fresh deployment');
      fetchExistingCredentials();
    } catch (err) {
      console.error('Clean slate error:', err);
      toast.error('Failed to clean slate');
    } finally {
      setIsAuditing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Zap className="w-6 h-6 text-yellow-400" />
                Tokyo HFT Infrastructure Setup
              </h1>
              <p className="text-muted-foreground text-sm">
                Configure 8 cloud providers for zero-touch Tokyo mesh deployment
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleCleanSlate}
              disabled={isAuditing}
              className="gap-2"
            >
              <Trash2 className={`w-4 h-4 ${isAuditing ? 'animate-spin' : ''}`} />
              Clean Slate
            </Button>
            <Button
              onClick={handleConnectAll}
              disabled={isConnecting}
              className="gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
            >
              <Zap className={`w-4 h-4 ${isConnecting ? 'animate-pulse' : ''}`} />
              {isConnecting ? 'Deploying...' : 'Connect All & Deploy'}
            </Button>
          </div>
        </div>

        {/* Cloud Providers Table */}
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Cloud Providers (8)</h2>
            <span className="ml-auto text-xs text-muted-foreground">
              All providers auto-deploy to Tokyo region for HFT
            </span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left p-3 w-20">Status</th>
                  <th className="text-left p-3 w-32">Provider</th>
                  <th className="text-left p-3">API Key / Access ID</th>
                  <th className="text-left p-3">API Secret / Key</th>
                  <th className="text-left p-3 w-28">Region</th>
                  <th className="text-center p-3 w-20">Pulse</th>
                  <th className="text-center p-3 w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {CLOUD_PROVIDERS.map((provider) => {
                  const cred = credentials[provider.id];
                  const isComplete = cred?.isComplete || false;
                  const isActive = cred?.isActive || false;
                  
                  return (
                    <tr 
                      key={provider.id}
                      className={`border-b border-border transition-all duration-300 ${
                        isComplete 
                          ? 'bg-green-400/10 border-l-4 border-l-green-400' 
                          : `${provider.colorClass} border-l-4 ${provider.borderClass}`
                      }`}
                    >
                      <td className="p-3">
                        {isComplete ? (
                          <div className="flex items-center gap-1 text-green-400">
                            <Check className="w-4 h-4" />
                            <span className="text-xs">COMPLETE</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400' : 'bg-muted'}`} />
                          <span className="font-medium">{provider.shortName}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <Input
                          type="password"
                          placeholder={`Enter ${provider.shortName} API Key`}
                          value={cred?.apiKey || ''}
                          onChange={(e) => handleCredentialChange(provider.id, 'apiKey', e.target.value)}
                          className="h-8 text-sm bg-background/50"
                        />
                      </td>
                      <td className="p-3">
                        {provider.hasSecret ? (
                          <div className="relative">
                            <Input
                              type={showSecrets[provider.id] ? 'text' : 'password'}
                              placeholder={`Enter ${provider.shortName} Secret`}
                              value={cred?.secret || ''}
                              onChange={(e) => handleCredentialChange(provider.id, 'secret', e.target.value)}
                              className="h-8 text-sm bg-background/50 pr-8"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSecrets(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showSecrets[provider.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="text-xs font-mono bg-secondary/50 px-2 py-1 rounded">
                          {provider.region}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className={`w-3 h-3 rounded-full mx-auto ${
                          isActive ? 'bg-green-400 animate-pulse' : 'bg-muted'
                        }`} />
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          size="sm"
                          variant={isComplete ? "outline" : "default"}
                          disabled={!cred?.apiKey || (provider.hasSecret && !cred?.secret) || cred?.isSaving}
                          onClick={() => handleSaveRow(provider.id)}
                          className="gap-1"
                        >
                          {cred?.isSaving ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Save className="h-3 w-3" />
                          )}
                          {isComplete ? 'Saved' : 'Save'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* VPS Health Monitoring */}
        <VPSHealthMonitor />

        {/* Exchange Pulse Panel */}
        <ExchangePulsePanel />

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold">Tokyo Mesh</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              All 8 providers auto-deploy to Tokyo (ap-northeast-1) for sub-5ms latency to Asian exchanges.
              Kraken routes to US-East, Nexo to Europe.
            </p>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-green-400" />
              <h3 className="font-semibold">Self-Healing Watchdog</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Every VPS includes systemd watchdog (5s timeout) with automatic restart on failure.
              HFT kernel tweaks pre-configured.
            </p>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-5 h-5 text-purple-400" />
              <h3 className="font-semibold">API Key Guides</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Click "Connect All" with empty fields to see step-by-step API key generation guides for each provider.
            </p>
          </div>
        </div>
      </div>

        {/* AI Providers Table */}
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">AI Providers (6)</h2>
            <span className="ml-auto text-xs text-muted-foreground">
              Auto-rotation on rate limits • Combined 185 RPM
            </span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left p-3 w-20">Status</th>
                  <th className="text-left p-3 w-32">Provider</th>
                  <th className="text-left p-3">API Key</th>
                  <th className="text-left p-3 w-24">Rate Limit</th>
                  <th className="text-left p-3 w-20">Usage</th>
                  <th className="text-center p-3 w-20">Pulse</th>
                  <th className="text-center p-3 w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {AI_PROVIDERS.map((provider) => {
                  const cred = aiCredentials[provider.id];
                  const isEnabled = cred?.isEnabled || false;
                  const isActive = cred?.isActive || false;
                  
                  return (
                    <tr 
                      key={provider.id}
                      className={`border-b border-border transition-all duration-300 ${
                        isEnabled 
                          ? 'bg-green-400/10 border-l-4 border-l-green-400' 
                          : `${provider.colorClass} border-l-4`
                      }`}
                      style={{ borderLeftColor: isEnabled ? undefined : provider.colorHex }}
                    >
                      <td className="p-3">
                        {isEnabled ? (
                          <div className="flex items-center gap-1 text-green-400">
                            <Check className="w-4 h-4" />
                            <span className="text-xs">ACTIVE</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1 rounded" style={{ backgroundColor: `${provider.colorHex}30`, color: provider.colorHex }}>
                            {getAIIcon(provider.icon)}
                          </div>
                          <span className="font-medium">{provider.shortName}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <Input
                          type="password"
                          placeholder={`Enter ${provider.shortName} API Key`}
                          value={cred?.apiKey || ''}
                          onChange={(e) => setAICredentials(prev => ({
                            ...prev,
                            [provider.id]: { ...prev[provider.id], apiKey: e.target.value }
                          }))}
                          className="h-8 text-sm bg-background/50"
                        />
                      </td>
                      <td className="p-3">
                        <span className="text-xs font-mono px-2 py-1 rounded" style={{ backgroundColor: `${provider.colorHex}20`, color: provider.colorHex }}>
                          {provider.rateLimitRpm} RPM
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-xs text-muted-foreground">
                          {cred?.currentUsage || 0}/{provider.rateLimitRpm}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div 
                          className={`w-3 h-3 rounded-full mx-auto ${isActive ? 'animate-pulse' : ''}`}
                          style={{ backgroundColor: isActive ? provider.colorHex : 'hsl(var(--muted))' }}
                        />
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          size="sm"
                          variant={isEnabled ? "outline" : "default"}
                          disabled={!cred?.apiKey || cred?.isSaving}
                          onClick={() => handleSaveAIRow(provider.id)}
                          className="gap-1"
                          style={!isEnabled && cred?.apiKey ? { backgroundColor: provider.colorHex } : undefined}
                        >
                          {cred?.isSaving ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Save className="h-3 w-3" />
                          )}
                          {isEnabled ? 'Saved' : 'Save'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      {/* Guide Modal */}
      <CloudKeyGuideModal
        open={showGuideModal}
        onOpenChange={setShowGuideModal}
        incompleteProviders={incompleteProviders}
      />

      {/* AI Wizards */}
      <GeminiWizard open={activeWizard === 'gemini'} onOpenChange={(open) => !open && setActiveWizard(null)} onSuccess={fetchAIProviders} />
      <CerebrasWizard open={activeWizard === 'cerebras'} onOpenChange={(open) => !open && setActiveWizard(null)} onSuccess={fetchAIProviders} />
      <TogetherWizard open={activeWizard === 'together'} onOpenChange={(open) => !open && setActiveWizard(null)} onSuccess={fetchAIProviders} />
      <OpenRouterWizard open={activeWizard === 'openrouter'} onOpenChange={(open) => !open && setActiveWizard(null)} onSuccess={fetchAIProviders} />
      <MistralWizard open={activeWizard === 'mistral'} onOpenChange={(open) => !open && setActiveWizard(null)} onSuccess={fetchAIProviders} />
    </div>
  );
}
