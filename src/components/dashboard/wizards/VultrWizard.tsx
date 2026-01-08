import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Check, Copy, Terminal, AlertCircle, Key } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface VultrWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'credentials' | 'deploying' | 'auto-installing' | 'installing' | 'success';

export function VultrWizard({ open, onOpenChange }: VultrWizardProps) {
  const [step, setStep] = useState<Step>('credentials');
  const [apiKey, setApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [instanceData, setInstanceData] = useState<{
    instanceId: string;
    publicIp: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const installCommand = `curl -sSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | sudo bash`;

  const handleReset = () => {
    setStep('credentials');
    setApiKey('');
    setIsValidating(false);
    setIsDeploying(false);
    setInstanceData(null);
  };

  const handleValidateAndDeploy = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter your Vultr API key');
      return;
    }
    
    // Validate API key format (Vultr keys are typically 36+ chars)
    if (apiKey.trim().length < 30) {
      toast.error('Invalid API key format - Vultr keys are typically 36+ characters');
      return;
    }

    setIsValidating(true);

    try {
      // Validate API key
      const { data: validateData, error: validateError } = await supabase.functions.invoke('vultr-cloud', {
        body: { action: 'validate-api-key', apiKey: apiKey.trim() }
      });

      if (validateError) throw validateError;

      if (!validateData?.valid) {
        toast.error('Invalid Vultr API key');
        setIsValidating(false);
        return;
      }

      toast.success('API key validated! Starting deployment...');
      setIsValidating(false);
      setIsDeploying(true);
      setStep('deploying');

      // Deploy instance
      const { data: deployData, error: deployError } = await supabase.functions.invoke('vultr-cloud', {
        body: {
          action: 'deploy-instance',
          apiKey: apiKey.trim(),
          specs: { region: 'nrt', plan: 'vhf-1c-1gb' }
        }
      });

      if (deployError) throw deployError;

      if (!deployData?.success) {
        throw new Error(deployData?.error || 'Deployment failed');
      }

      setInstanceData({
        instanceId: deployData.instanceId,
        publicIp: deployData.publicIp,
      });

      // Register VPS in database
      await supabase.from('vps_config').upsert({
        provider: 'vultr',
        region: 'tokyo',
        status: 'running',
        outbound_ip: deployData.publicIp,
        updated_at: new Date().toISOString()
      }, { onConflict: 'provider' });

      // Update failover config
      await supabase.from('failover_config')
        .update({ 
          latency_ms: 0,
          consecutive_failures: 0,
          last_health_check: new Date().toISOString()
        })
        .eq('provider', 'vultr');

      // Send Telegram notification
      await supabase.functions.invoke('telegram-bot', {
        body: {
          action: 'send-message',
          message: `🚀 <b>VPS DEPLOYED: Vultr Tokyo</b>\n\n✅ Status: Running\n🌐 IP: ${deployData.publicIp}\n📍 Region: Tokyo NRT\n💰 Cost: $5/mo`
        }
      });

      // Attempt automatic bot installation via SSH
      setStep('auto-installing');
      setIsDeploying(false);

      try {
        // Wait a bit for VPS to be fully booted
        await new Promise(resolve => setTimeout(resolve, 30000));

        console.log('[VultrWizard] Attempting automatic SSH installation...');
        
        const { data: sshResult, error: sshError } = await supabase.functions.invoke('ssh-command', {
          body: {
            ipAddress: deployData.publicIp,
            privateKey: deployData.sshPrivateKey,
            command: installCommand,
            username: 'root',
            timeout: 120000
          }
        });

        if (sshError || !sshResult?.success) {
          console.log('[VultrWizard] Auto-install failed, falling back to manual');
          setStep('installing');
        } else {
          console.log('[VultrWizard] Auto-install succeeded!');
          toast.success('HFT bot installed automatically!');
          setStep('success');
        }
      } catch (sshErr) {
        console.error('[VultrWizard] SSH installation error:', sshErr);
        // Fall back to manual installation
        setStep('installing');
      }

    } catch (err: any) {
      console.error('Vultr deployment error:', err);
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
        body: { ip: instanceData.publicIp, provider: 'vultr' }
      });

      if (error) throw error;

      if (data?.healthy) {
        await supabase.from('vps_config')
          .update({ status: 'running' })
          .eq('provider', 'vultr');

        setStep('success');
        toast.success('Vultr VPS connected and verified!');
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">🦅</span>
            Vultr Tokyo VPS
          </DialogTitle>
        </DialogHeader>

        {step === 'credentials' && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
              <p className="text-sm">
                Enter your Vultr API key to deploy a high-frequency VPS in Tokyo (NRT).
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiKey" className="flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  Vultr API Key
                </Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="Enter your Vultr API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Get your API key from{' '}
                  <a href="https://my.vultr.com/settings/#settingsapi" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Vultr API Settings
                  </a>
                </p>
              </div>

              <div className="p-3 rounded-lg bg-secondary/30 text-sm space-y-1">
                <p><strong>Instance:</strong> High Frequency 1 vCPU, 1GB RAM</p>
                <p><strong>Region:</strong> Tokyo (NRT)</p>
                <p><strong>Cost:</strong> ~$5/month</p>
              </div>
            </div>

            <Button 
              onClick={handleValidateAndDeploy} 
              disabled={isValidating || !apiKey.trim()}
              className="w-full"
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                'Validate & Deploy'
              )}
            </Button>
          </div>
        )}

        {step === 'deploying' && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
            <div>
              <p className="font-medium">Deploying Vultr VPS</p>
              <p className="text-sm text-muted-foreground">
                Creating high-frequency instance in Tokyo...
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                This may take 2-3 minutes
              </p>
            </div>
          </div>
        )}

        {step === 'auto-installing' && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
            <div>
              <p className="font-medium">Installing HFT Bot</p>
              <p className="text-sm text-muted-foreground">
                Automatically installing via SSH...
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                This may take 1-2 minutes
              </p>
            </div>
          </div>
        )}

        {step === 'installing' && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-success/10 border border-success/30 flex items-start gap-3">
              <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Instance Created!</p>
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
                  SSH into your server and run the command below.
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
              <p className="text-lg font-medium">Vultr VPS Connected!</p>
              <p className="text-sm text-muted-foreground mt-2">
                Your HFT bot is running on <span className="font-mono">{instanceData?.publicIp}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-secondary/30">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Provider</p>
                <p className="font-medium">Vultr</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Region</p>
                <p className="font-medium">Tokyo NRT</p>
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
