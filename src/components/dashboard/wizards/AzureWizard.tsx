import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Check, Copy, Terminal, AlertCircle, Key } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface AzureWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'credentials' | 'deploying' | 'installing' | 'success';

export function AzureWizard({ open, onOpenChange }: AzureWizardProps) {
  const [step, setStep] = useState<Step>('credentials');
  const [subscriptionId, setSubscriptionId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [instanceData, setInstanceData] = useState<{
    vmId: string;
    publicIp: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const installCommand = `curl -sSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | sudo bash`;

  const handleReset = () => {
    setStep('credentials');
    setSubscriptionId('');
    setTenantId('');
    setClientId('');
    setClientSecret('');
    setIsValidating(false);
    setIsDeploying(false);
    setInstanceData(null);
  };

  const handleValidateAndDeploy = async () => {
    if (!subscriptionId.trim() || !tenantId.trim() || !clientId.trim() || !clientSecret.trim()) {
      toast.error('Please fill in all Azure credentials');
      return;
    }

    // Azure GUID format validation
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guidRegex.test(subscriptionId.trim())) {
      toast.error('Invalid Subscription ID format - should be a valid GUID');
      return;
    }
    if (!guidRegex.test(tenantId.trim())) {
      toast.error('Invalid Tenant ID format - should be a valid GUID');
      return;
    }
    if (!guidRegex.test(clientId.trim())) {
      toast.error('Invalid Client ID format - should be a valid GUID');
      return;
    }
    if (clientSecret.trim().length < 10) {
      toast.error('Invalid Client Secret format');
      return;
    }

    setIsValidating(true);

    try {
      // Deploy via edge function
      const { data: deployData, error: deployError } = await supabase.functions.invoke('azure-cloud', {
        body: {
          action: 'deploy-instance',
          credentials: {
            subscriptionId: subscriptionId.trim(),
            tenantId: tenantId.trim(),
            clientId: clientId.trim(),
            clientSecret: clientSecret.trim()
          },
          specs: { 
            location: 'japaneast',
            vmSize: 'Standard_B1ls'
          }
        }
      });

      if (deployError) throw deployError;

      if (!deployData?.success) {
        throw new Error(deployData?.error || 'Deployment failed');
      }

      setIsValidating(false);
      setIsDeploying(true);
      setStep('deploying');

      // Simulate deployment time
      await new Promise(resolve => setTimeout(resolve, 3000));

      setInstanceData({
        vmId: deployData.vmId || 'azure-japan-hft',
        publicIp: deployData.publicIp || '20.xxx.xxx.xxx',
      });

      // Register VPS in database
      await supabase.from('vps_config').upsert({
        provider: 'azure',
        region: 'japaneast',
        status: 'running',
        outbound_ip: deployData.publicIp,
        instance_type: 'Standard_B1ls',
        updated_at: new Date().toISOString()
      }, { onConflict: 'provider' });

      // Update failover config
      await supabase.from('failover_config')
        .update({ 
          latency_ms: 0,
          consecutive_failures: 0,
          last_health_check: new Date().toISOString()
        })
        .eq('provider', 'azure');

      // Send Telegram notification
      await supabase.functions.invoke('telegram-bot', {
        body: {
          action: 'send-message',
          message: `🚀 <b>VPS DEPLOYED: Azure Japan East</b>\n\n✅ Status: Running\n🌐 IP: ${deployData.publicIp}\n📍 Region: Japan East\n💰 Cost: FREE (B1ls Free Tier: 750 hrs/mo)`
        }
      });

      setStep('installing');
      setIsDeploying(false);

    } catch (err: any) {
      console.error('Azure deployment error:', err);
      toast.error(`Deployment failed: ${err.message}`);
      setIsValidating(false);
      setIsDeploying(false);
      setStep('credentials');
    }
  };

  const handleVerifyInstallation = async () => {
    if (!instanceData?.publicIp) return;

    setIsDeploying(true);

    try {
      const { data, error } = await supabase.functions.invoke('check-vps-health', {
        body: { ip: instanceData.publicIp, provider: 'azure' }
      });

      if (error) throw error;

      if (data?.healthy) {
        await supabase.from('vps_config')
          .update({ status: 'running' })
          .eq('provider', 'azure');

        setStep('success');
        toast.success('Azure VM connected and verified!');
      } else {
        toast.info('HFT bot not responding yet. Please wait for installation to complete.');
      }
    } catch (err: any) {
      toast.error('Verification failed. Please ensure the install script completed.');
    } finally {
      setIsDeploying(false);
    }
  };

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(installCommand);
    setCopied(true);
    toast.success('Command copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">💠</span>
            Azure Japan East (Free Tier)
          </DialogTitle>
        </DialogHeader>

        {step === 'credentials' && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-success/10 border border-success/30">
              <p className="text-sm">
                Deploy a B1ls VM in Japan East using Azure's <strong>Free tier</strong> - 750 hours/month free for 12 months.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subscriptionId" className="flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  Subscription ID
                </Label>
                <Input
                  id="subscriptionId"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={subscriptionId}
                  onChange={(e) => setSubscriptionId(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tenantId">Tenant ID (Directory ID)</Label>
                <Input
                  id="tenantId"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientId">Client ID (Application ID)</Label>
                <Input
                  id="clientId"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientSecret">Client Secret</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  placeholder="Enter your client secret"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Create a service principal in{' '}
                  <a href="https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Azure Portal → App registrations
                  </a>
                </p>
              </div>

              <div className="p-3 rounded-lg bg-secondary/30 text-sm space-y-1">
                <p><strong>Instance:</strong> Standard_B1ls (1 vCPU, 0.5GB RAM)</p>
                <p><strong>Location:</strong> Japan East</p>
                <p><strong>Cost:</strong> <span className="text-success font-medium">FREE</span> (750 hrs/mo for 12 months)</p>
              </div>
            </div>

            <Button 
              onClick={handleValidateAndDeploy} 
              disabled={isValidating || !subscriptionId.trim() || !tenantId.trim() || !clientId.trim() || !clientSecret.trim()}
              className="w-full"
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                'Deploy Free VM'
              )}
            </Button>
          </div>
        )}

        {step === 'deploying' && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
            <div>
              <p className="font-medium">Deploying Azure VM</p>
              <p className="text-sm text-muted-foreground">
                Creating B1ls VM in Japan East...
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                This may take 2-4 minutes
              </p>
            </div>
          </div>
        )}

        {step === 'installing' && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-success/10 border border-success/30 flex items-start gap-3">
              <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Azure VM Created!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  IP: <span className="font-mono">{instanceData?.publicIp}</span>
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-warning/10 border border-warning/30 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Install HFT Bot</p>
                <p className="text-xs text-muted-foreground mt-1">
                  SSH into your Azure VM and run the command below.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                Installation Command
              </Label>
              <div className="relative">
                <pre className="p-3 rounded-lg bg-secondary/50 text-xs font-mono overflow-x-auto border">
                  {installCommand}
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-1 right-1"
                  onClick={handleCopyCommand}
                >
                  {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Button 
                onClick={handleVerifyInstallation} 
                disabled={isDeploying}
                className="w-full"
              >
                {isDeploying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify Installation'
                )}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setStep('credentials')}
                className="w-full"
              >
                Back
              </Button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="py-8 text-center space-y-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-success/20 flex items-center justify-center">
              <Check className="w-8 h-8 text-success" />
            </div>
            <div>
              <p className="text-lg font-medium">Azure VM Connected!</p>
              <p className="text-sm text-muted-foreground mt-2">
                Free tier HFT bot on <span className="font-mono">{instanceData?.publicIp}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-secondary/30">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Provider</p>
                <p className="font-medium">Azure</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Cost</p>
                <p className="font-medium text-success">FREE</p>
              </div>
            </div>
            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
