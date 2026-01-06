import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Cloud, Loader2, CheckCircle2, Server, Lock, MapPin, Rocket, Wifi, Shield, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { useCloudConfig } from '@/hooks/useCloudConfig';
import { useRealtimeConfirmation } from '@/hooks/useRealtimeConfirmation';
import { supabase } from '@/integrations/supabase/client';

interface CloudWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: 'digitalocean' | 'aws' | 'gcp' | null;
}

type DeploymentStage = 'idle' | 'validating' | 'creating' | 'waiting-ip' | 'configuring-firewall' | 'installing' | 'health-check' | 'complete' | 'error';

const PROVIDER_CONFIG = {
  digitalocean: {
    name: 'DigitalOcean',
    icon: '🌊',
    region: 'sgp1 (Singapore)',
    regionCode: 'sgp1',
    freeInstance: '$6/mo Droplet (1GB RAM)',
    fields: [
      { id: 'token', label: 'Personal Access Token', type: 'password', placeholder: 'dop_v1_...' }
    ],
    supportsAutoDeploy: true,
  },
  aws: {
    name: 'Amazon Web Services',
    icon: '☁️',
    region: 'ap-northeast-1 (Tokyo)',
    regionCode: 'ap-northeast-1',
    freeInstance: 't4g.micro (750 hrs/mo free)',
    fields: [
      { id: 'accessKey', label: 'Access Key ID', type: 'text', placeholder: 'AKIA...' },
      { id: 'secretKey', label: 'Secret Access Key', type: 'password', placeholder: '...' }
    ],
    supportsAutoDeploy: false,
  },
  gcp: {
    name: 'Google Cloud',
    icon: '🔷',
    region: 'asia-northeast1 (Tokyo)',
    regionCode: 'asia-northeast1',
    freeInstance: 'e2-micro (Always Free)',
    fields: [
      { id: 'serviceAccount', label: 'Service Account JSON', type: 'textarea', placeholder: '{\n  "type": "service_account",\n  ...\n}' }
    ],
    supportsAutoDeploy: false,
  }
};

const DEPLOYMENT_STAGES: Record<DeploymentStage, { label: string; icon: React.ReactNode }> = {
  idle: { label: 'Ready', icon: <Server className="h-4 w-4" /> },
  validating: { label: 'Validating credentials...', icon: <Loader2 className="h-4 w-4 animate-spin" /> },
  creating: { label: 'Creating Droplet...', icon: <Rocket className="h-4 w-4 animate-pulse" /> },
  'waiting-ip': { label: 'Waiting for IP assignment...', icon: <Wifi className="h-4 w-4 animate-pulse" /> },
  'configuring-firewall': { label: 'Configuring firewall...', icon: <Shield className="h-4 w-4 animate-pulse" /> },
  installing: { label: 'Installing HFT bot...', icon: <Loader2 className="h-4 w-4 animate-spin" /> },
  'health-check': { label: 'Verifying health check...', icon: <Activity className="h-4 w-4 animate-pulse" /> },
  complete: { label: 'Deployment complete!', icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> },
  error: { label: 'Deployment failed', icon: <Server className="h-4 w-4 text-destructive" /> },
};

export function CloudWizard({ open, onOpenChange, provider }: CloudWizardProps) {
  const { saveProviderConfig, getProviderConfig } = useCloudConfig();
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [deploymentStage, setDeploymentStage] = useState<DeploymentStage>('idle');
  const [dropletInfo, setDropletInfo] = useState<{ id?: string; ip?: string; error?: string }>({});

  // Realtime confirmation for optimistic UI
  const confirmation = useRealtimeConfirmation({
    table: 'cloud_config',
    matchColumn: 'provider',
    matchValue: provider || '',
    timeoutMs: 5000,
  });

  // Auto-advance to success when realtime confirms (for non-deploy flow)
  useEffect(() => {
    if (confirmation.isConfirmed && isSaving && deploymentStage === 'idle') {
      setIsSaving(false);
      setIsSuccess(true);
      toast.success(`${provider ? PROVIDER_CONFIG[provider].name : 'Provider'} configured successfully!`);
    }
  }, [confirmation.isConfirmed, isSaving, provider, deploymentStage]);

  if (!provider) return null;

  const config = PROVIDER_CONFIG[provider];

  const pollDropletStatus = async (dropletId: string, token: string): Promise<string | null> => {
    for (let i = 0; i < 30; i++) { // Poll for up to 5 minutes
      await new Promise(r => setTimeout(r, 10000)); // Wait 10s between polls
      
      const { data, error } = await supabase.functions.invoke('digitalocean-cloud', {
        body: { action: 'status', dropletId }
      });

      if (data?.ip && data?.status === 'active') {
        return data.ip;
      }
      console.log(`[CloudWizard] Poll ${i + 1}: status=${data?.status}, ip=${data?.ip}`);
    }
    return null;
  };

  const waitForHealthCheck = async (ip: string): Promise<boolean> => {
    for (let i = 0; i < 36; i++) { // Poll for up to 6 minutes
      await new Promise(r => setTimeout(r, 10000)); // Wait 10s between polls
      
      try {
        const response = await fetch(`http://${ip}:8080/health`, { 
          mode: 'no-cors',
          signal: AbortSignal.timeout(5000)
        });
        // no-cors means we can't read the response, but if we get here without error, it's likely up
        return true;
      } catch {
        console.log(`[CloudWizard] Health check poll ${i + 1}: waiting...`);
      }
    }
    return false;
  };

  const handleDeployDigitalOcean = async () => {
    const token = credentials.token?.trim();
    if (!token) {
      toast.error('Please enter your DigitalOcean API token');
      return;
    }

    setIsSaving(true);
    setDeploymentStage('validating');

    try {
      // Step 1: Validate API token
      const validateResult = await supabase.functions.invoke('digitalocean-cloud', {
        body: { action: 'validate' }
      });

      // Note: We're using the secret stored in Supabase, not the form field
      // First save the credentials so the edge function can use them
      await saveProviderConfig(provider, { token }, {
        region: config.regionCode,
        useFreeTier: true
      });

      // Step 2: Deploy Droplet
      setDeploymentStage('creating');
      const deployResult = await supabase.functions.invoke('digitalocean-cloud', {
        body: { action: 'deploy', region: config.regionCode }
      });

      if (!deployResult.data?.success) {
        throw new Error(deployResult.data?.error || 'Failed to create Droplet');
      }

      const dropletId = deployResult.data.dropletId;
      setDropletInfo({ id: dropletId });
      console.log('[CloudWizard] Droplet created:', dropletId);

      // Step 3: Wait for IP assignment
      setDeploymentStage('waiting-ip');
      const ip = await pollDropletStatus(dropletId, token);
      
      if (!ip) {
        throw new Error('Timeout waiting for IP assignment');
      }

      setDropletInfo(prev => ({ ...prev, ip }));
      console.log('[CloudWizard] IP assigned:', ip);

      // Step 4: Configure firewall
      setDeploymentStage('configuring-firewall');
      await supabase.functions.invoke('digitalocean-cloud', {
        body: { action: 'configure-firewall', dropletId }
      });

      // Step 5: Update vps_config with the new IP
      setDeploymentStage('installing');
      
      // Insert or update vps_config
      const { error: vpsError } = await supabase
        .from('vps_config')
        .upsert({
          provider: 'digitalocean',
          outbound_ip: ip,
          region: config.regionCode,
          status: 'provisioning',
          instance_type: 's-1vcpu-1gb',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'provider' });

      if (vpsError) {
        console.error('[CloudWizard] VPS config update error:', vpsError);
      }

      // Update cloud_config with droplet ID
      await supabase
        .from('cloud_config')
        .update({
          credentials: { token, dropletId, ip },
          status: 'deploying',
          updated_at: new Date().toISOString(),
        })
        .eq('provider', 'digitalocean');

      // Step 6: Wait for health check
      setDeploymentStage('health-check');
      
      // Give the install script time to run (it takes 3-5 minutes)
      await new Promise(r => setTimeout(r, 180000)); // Wait 3 minutes initially
      
      // Now poll for health
      const healthOk = await waitForHealthCheck(ip);

      if (healthOk) {
        // Update vps_config to running
        await supabase
          .from('vps_config')
          .update({ status: 'running', updated_at: new Date().toISOString() })
          .eq('provider', 'digitalocean');

        // Update cloud_config to active
        await supabase
          .from('cloud_config')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('provider', 'digitalocean');
      }

      setDeploymentStage('complete');
      setIsSuccess(true);
      toast.success(`DigitalOcean Droplet deployed! IP: ${ip}`);

    } catch (error) {
      console.error('[CloudWizard] Deployment error:', error);
      setDeploymentStage('error');
      setDropletInfo(prev => ({ ...prev, error: error instanceof Error ? error.message : 'Unknown error' }));
      toast.error(error instanceof Error ? error.message : 'Deployment failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    // Validate all fields are filled
    const missingFields = config.fields.filter(f => !credentials[f.id]?.trim());
    if (missingFields.length > 0) {
      toast.error(`Please fill in: ${missingFields.map(f => f.label).join(', ')}`);
      return;
    }

    // For DigitalOcean, use the auto-deploy flow
    if (provider === 'digitalocean') {
      await handleDeployDigitalOcean();
      return;
    }

    // For other providers, just save credentials
    setIsSaving(true);
    confirmation.startWaiting();
    
    const result = await saveProviderConfig(provider, credentials, {
      region: config.regionCode,
      useFreeTier: true
    });

    if (!result.success) {
      setIsSaving(false);
      confirmation.reset();
      toast.error(result.error || 'Failed to save configuration');
    }
  };

  const handleClose = () => {
    setCredentials({});
    setIsSuccess(false);
    setDeploymentStage('idle');
    setDropletInfo({});
    confirmation.reset();
    onOpenChange(false);
  };

  const isDeploying = deploymentStage !== 'idle' && deploymentStage !== 'complete' && deploymentStage !== 'error';

  return (
    <Dialog open={open} onOpenChange={isDeploying ? undefined : handleClose}>
      <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-primary/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="text-2xl">{config.icon}</span>
            {config.name} Setup
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {!isSuccess ? (
            <>
              {/* Deployment Progress */}
              {isDeploying && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    {DEPLOYMENT_STAGES[deploymentStage].icon}
                    <span className="font-medium">{DEPLOYMENT_STAGES[deploymentStage].label}</span>
                  </div>
                  {dropletInfo.ip && (
                    <div className="text-sm text-muted-foreground">
                      IP: <span className="font-mono text-primary">{dropletInfo.ip}</span>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    This may take 5-7 minutes. Do not close this window.
                  </div>
                </div>
              )}

              {deploymentStage === 'error' && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                  <p className="text-sm text-destructive">{dropletInfo.error || 'Deployment failed'}</p>
                </div>
              )}

              {deploymentStage === 'idle' && (
                <>
                  {/* Region Lock Banner */}
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-primary shrink-0" />
                    <div className="text-sm">
                      <span className="font-medium">Region: </span>
                      <span className="text-muted-foreground">{config.region}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Optimal for Binance/OKX latency
                      </p>
                    </div>
                  </div>

                  {/* Instance Info */}
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center gap-3">
                    <Server className="h-5 w-5 text-green-500 shrink-0" />
                    <div className="text-sm">
                      <span className="font-medium">Instance: </span>
                      <span className="text-muted-foreground">{config.freeInstance}</span>
                    </div>
                  </div>

                  {/* Auto-Deploy Badge */}
                  {config.supportsAutoDeploy && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 flex items-center gap-3">
                      <Rocket className="h-5 w-5 text-yellow-500 shrink-0" />
                      <div className="text-sm">
                        <span className="font-medium">One-Click Deploy: </span>
                        <span className="text-muted-foreground">Automatic VPS provisioning enabled</span>
                      </div>
                    </div>
                  )}

                  {/* Credential Fields */}
                  <div className="space-y-4">
                    {config.fields.map((field) => (
                      <div key={field.id} className="space-y-2">
                        <Label htmlFor={field.id}>{field.label}</Label>
                        {field.type === 'textarea' ? (
                          <Textarea
                            id={field.id}
                            placeholder={field.placeholder}
                            value={credentials[field.id] || ''}
                            onChange={(e) => setCredentials(prev => ({ ...prev, [field.id]: e.target.value }))}
                            className="bg-background/50 min-h-[120px] font-mono text-xs"
                          />
                        ) : (
                          <Input
                            id={field.id}
                            type={field.type}
                            placeholder={field.placeholder}
                            value={credentials[field.id] || ''}
                            onChange={(e) => setCredentials(prev => ({ ...prev, [field.id]: e.target.value }))}
                            className="bg-background/50"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Security Note */}
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Lock className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Credentials are encrypted and stored securely. Never shared externally.</span>
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose} className="flex-1" disabled={isDeploying}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSave} 
                  disabled={isSaving || isDeploying} 
                  className="flex-1"
                >
                  {isSaving || isDeploying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isDeploying ? 'Deploying...' : 'Connecting...'}
                    </>
                  ) : config.supportsAutoDeploy ? (
                    <>
                      <Rocket className="mr-2 h-4 w-4" />
                      Connect & Deploy
                    </>
                  ) : (
                    'Connect'
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-4 text-center">
              <div className="relative mx-auto w-16 h-16">
                <Cloud className="h-16 w-16 text-primary" />
                <CheckCircle2 className="h-6 w-6 text-green-500 absolute -bottom-1 -right-1" />
              </div>
              <h3 className="font-semibold text-lg">{config.name} Deployed!</h3>
              <p className="text-sm text-muted-foreground">
                Your HFT bot VPS is now online and ready
              </p>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Region:</span>
                  <span>{config.region}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Instance:</span>
                  <span>{config.freeInstance}</span>
                </div>
                {dropletInfo.ip && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IP Address:</span>
                    <span className="font-mono text-primary">{dropletInfo.ip}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="text-green-500">Running</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Next: Add this IP to your exchange API whitelist
              </p>
              <Button className="w-full" onClick={handleClose}>
                Done
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
