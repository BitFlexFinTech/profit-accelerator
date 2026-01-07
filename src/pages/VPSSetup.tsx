import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Settings, Server, DollarSign, Zap, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCloudCredentials } from '@/hooks/useCloudCredentials';
import { PROVIDER_CONFIGS, Provider } from '@/types/cloudCredentials';
import { DeploymentWizard } from '@/components/deployment/DeploymentWizard';
import { cn } from '@/lib/utils';

// Provider logos (using emoji for now, can be replaced with actual logos)
const PROVIDER_ICONS: Record<Provider, string> = {
  aws: '☁️',
  digitalocean: '🌊',
  vultr: '🦅',
  contabo: '🔷',
  oracle: '🔴',
  gcp: '🔵',
  alibaba: '🟠',
  azure: '🔷',
};

export default function VPSSetup() {
  const navigate = useNavigate();
  const { getProviderStatus, isLoading } = useCloudCredentials();
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  // Mock instance counts and costs (would come from database)
  const getProviderStats = (provider: Provider) => {
    // This would be fetched from vps_instances table
    return {
      instanceCount: 0,
      monthlyCost: 0,
    };
  };

  const handleDeployClick = (provider: Provider) => {
    setSelectedProvider(provider);
    setShowWizard(true);
  };

  const handleWizardClose = () => {
    setShowWizard(false);
    setSelectedProvider(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">VPS Setup & Deployment</h1>
              <p className="text-muted-foreground text-sm">
                Select a cloud provider to deploy your HFT trading bot with zero manual intervention.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate('/cloud-credentials')}>
            <Settings className="h-4 w-4 mr-2" />
            Manage Credentials
          </Button>
        </div>

        {/* Provider Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PROVIDER_CONFIGS.map(provider => {
            const status = getProviderStatus(provider.name);
            const stats = getProviderStats(provider.name);
            const isReady = status === 'validated';

            return (
              <Card
                key={provider.name}
                className={cn(
                  "transition-all hover:shadow-lg",
                  isReady && "border-green-500/50 hover:border-green-500"
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{PROVIDER_ICONS[provider.name]}</span>
                      <CardTitle className="text-lg">{provider.displayName}</CardTitle>
                    </div>
                    <Badge className={cn(provider.color, provider.textColor)}>
                      {provider.displayName}
                    </Badge>
                  </div>
                  <CardDescription>
                    {status === 'not_configured' && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        🔴 Not Configured
                      </span>
                    )}
                    {status === 'pending' && (
                      <span className="flex items-center gap-1 text-yellow-500">
                        🟡 Credentials Unvalidated
                      </span>
                    )}
                    {status === 'validated' && (
                      <span className="flex items-center gap-1 text-green-500">
                        🟢 Ready to Deploy
                      </span>
                    )}
                    {status === 'error' && (
                      <span className="flex items-center gap-1 text-red-500">
                        🔴 Credentials Error
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Server className="h-4 w-4" />
                      <span>{stats.instanceCount} instances</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <DollarSign className="h-4 w-4" />
                      <span>${stats.monthlyCost}/mo</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    {status === 'not_configured' || status === 'error' ? (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => navigate('/cloud-credentials')}
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        Configure Credentials
                      </Button>
                    ) : status === 'pending' ? (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => navigate('/cloud-credentials')}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Validate Credentials
                      </Button>
                    ) : (
                      <Button
                        className="w-full bg-green-600 hover:bg-green-700"
                        onClick={() => handleDeployClick(provider.name)}
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        Deploy New Server
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Tips */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">🚀 How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Step 1</Badge>
                  <span className="font-medium">Enter Credentials</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Add your cloud provider API keys in the credentials table. You only need to do this once.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Step 2</Badge>
                  <span className="font-medium">Click Deploy</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Select your region and bot configuration. Click deploy and the system handles everything.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Step 3</Badge>
                  <span className="font-medium">Bot Runs Automatically</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  The VPS is created, configured, and your bot is started with PM2 - all without manual SSH.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="mt-6 flex justify-between">
          <Button variant="outline" onClick={() => navigate('/cloud-credentials')}>
            ← Manage Credentials
          </Button>
          <Button variant="outline" onClick={() => navigate('/vps-dashboard')}>
            View Servers →
          </Button>
        </div>
      </div>

      {/* Deployment Wizard Modal */}
      {showWizard && selectedProvider && (
        <DeploymentWizard
          provider={selectedProvider}
          onClose={handleWizardClose}
        />
      )}
    </div>
  );
}
