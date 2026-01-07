import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Check, Eye, EyeOff, RefreshCw, Zap, 
  Server, Globe, Shield, BookOpen, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CloudKeyGuideModal } from '@/components/dashboard/wizards/CloudKeyGuideModal';
import { ExchangePulsePanel } from '@/components/dashboard/panels/ExchangePulsePanel';

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

interface CloudCredentials {
  [key: string]: {
    apiKey: string;
    secret: string;
    isComplete: boolean;
    isActive: boolean;
  };
}

export default function Setup() {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState<CloudCredentials>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [incompleteProviders, setIncompleteProviders] = useState<string[]>([]);

  useEffect(() => {
    fetchExistingCredentials();
  }, []);

  const fetchExistingCredentials = async () => {
    try {
      const { data, error } = await supabase
        .from('cloud_config')
        .select('*');

      if (error) throw error;

      const creds: CloudCredentials = {};
      for (const provider of CLOUD_PROVIDERS) {
        const existing = data?.find(d => d.provider.toLowerCase() === provider.id);
        const existingCreds = existing?.credentials as Record<string, string> | null;
        
        creds[provider.id] = {
          apiKey: existingCreds?.[provider.apiKeyField] || '',
          secret: provider.hasSecret ? (existingCreds?.[provider.secretField || ''] || '') : '',
          isComplete: existing?.is_active || false,
          isActive: existing?.is_active || false,
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
      // Save all credentials to cloud_config
      for (const provider of CLOUD_PROVIDERS) {
        const cred = credentials[provider.id];
        if (!cred?.apiKey) continue;

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
          is_active: true,
          status: 'configured',
        }, { onConflict: 'provider' });

        // Update local state
        setCredentials(prev => ({
          ...prev,
          [provider.id]: {
            ...prev[provider.id],
            isActive: true,
          }
        }));
      }

      toast.success('All cloud providers connected successfully!');

      // Trigger mesh deployment
      const { data, error } = await supabase.functions.invoke('auto-provision-mesh', {
        body: { action: 'deploy-all' }
      });

      if (error) throw error;
      toast.success(`Mesh deployment started: ${data?.deployed?.length || 0} providers`);
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

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

      {/* Guide Modal */}
      <CloudKeyGuideModal
        open={showGuideModal}
        onOpenChange={setShowGuideModal}
        incompleteProviders={incompleteProviders}
      />
    </div>
  );
}
