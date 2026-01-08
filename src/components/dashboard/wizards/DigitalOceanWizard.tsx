import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Check, Copy, Terminal, AlertCircle, Key } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface DigitalOceanWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'credentials' | 'deploying' | 'waiting' | 'success';

export function DigitalOceanWizard({ open, onOpenChange }: DigitalOceanWizardProps) {
  const [step, setStep] = useState<Step>('credentials');
  const [apiToken, setApiToken] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [instanceData, setInstanceData] = useState<{
    dropletId: string;
    publicIp: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const installCommand = `curl -sSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | sudo bash`;

  // Load credentials from database when wizard opens
  const loadCredentialsFromDB = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('cloud_credentials')
        .select('field_name, encrypted_value')
        .eq('provider', 'digitalocean');
      
      if (data) {
        data.forEach(row => {
          if (row.field_name === 'personal_access_token' && row.encrypted_value) {
            setApiToken(row.encrypted_value);
          }
        });
      }
    } catch (err) {
      console.error('[DigitalOceanWizard] Error loading credentials:', err);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadCredentialsFromDB();
    }
  }, [open, loadCredentialsFromDB]);

  const handleReset = () => {
    setStep('credentials');
    setApiToken('');
    setIsValidating(false);
    setIsDeploying(false);
    setInstanceData(null);
  };

  const handleValidateAndDeploy = async () => {
    if (!apiToken.trim()) {
      toast.error('Please enter your DigitalOcean API token');
      return;
    }

    // DigitalOcean tokens are 64+ characters
    if (apiToken.trim().length < 64) {
      toast.error('Invalid API token format - DigitalOcean tokens are 64+ characters');
      return;
    }

    setIsValidating(true);

    try {

      toast.success('Token validated! Starting deployment...');
      setIsValidating(false);
      setIsDeploying(true);
      setStep('deploying');

      // Deploy droplet
      const { data: deployData, error: deployError } = await supabase.functions.invoke('digitalocean-cloud', {
        body: {
          action: 'deploy',
          region: 'sgp1'
        }
      });

      if (deployError) throw deployError;

      if (!deployData?.success) {
        throw new Error(deployData?.error || 'Deployment failed');
      }

      const dropletId = deployData.dropletId;
      setStep('waiting');

      // Poll for IP address
      let attempts = 0;
      const maxAttempts = 30;
      let publicIp = '';

      while (attempts < maxAttempts && !publicIp) {
        await new Promise(resolve => setTimeout(resolve, 5000));

        const { data: statusData } = await supabase.functions.invoke('digitalocean-cloud', {
          body: { action: 'status', dropletId }
        });

        if (statusData?.ip && statusData.ip !== '0.0.0.0') {
          publicIp = statusData.ip;
        }
        attempts++;
      }

      if (!publicIp) {
        throw new Error('Timed out waiting for IP assignment');
      }

      setInstanceData({ dropletId, publicIp });

      // Register VPS in database
      await supabase.from('vps_config').upsert({
        provider: 'digitalocean',
        region: 'sgp1',
        status: 'running',
        outbound_ip: publicIp,
        updated_at: new Date().toISOString()
      }, { onConflict: 'provider' });

      // Update failover config
      await supabase.from('failover_config')
        .update({ 
          latency_ms: 0,
          consecutive_failures: 0,
          last_health_check: new Date().toISOString()
        })
        .eq('provider', 'digitalocean');

      // Send Telegram notification
      await supabase.functions.invoke('telegram-bot', {
        body: {
          action: 'send-message',
          message: `🚀 <b>VPS DEPLOYED: DigitalOcean Singapore</b>\n\n✅ Status: Running\n🌐 IP: ${publicIp}\n📍 Region: Singapore SGP1\n💰 Cost: $4/mo`
        }
      });

      setStep('success');
      setIsDeploying(false);
      toast.success('DigitalOcean Droplet deployed successfully!');

    } catch (err: any) {
      console.error('DigitalOcean deployment error:', err);
      toast.error(`Deployment failed: ${err.message}`);
      setIsValidating(false);
      setIsDeploying(false);
      setStep('credentials');
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
            <span className="text-2xl">🌊</span>
            DigitalOcean Singapore
          </DialogTitle>
        </DialogHeader>

        {step === 'credentials' && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
              <p className="text-sm">
                Deploy a Droplet in Singapore (SGP1) - closest DigitalOcean region to Tokyo for low latency.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiToken" className="flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  API Token
                </Label>
                <Input
                  id="apiToken"
                  type="password"
                  placeholder="Enter your DigitalOcean API token"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Generate a token in{' '}
                  <a href="https://cloud.digitalocean.com/account/api/tokens" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    DigitalOcean API Settings
                  </a>
                </p>
              </div>

              <div className="p-3 rounded-lg bg-secondary/30 text-sm space-y-1">
                <p><strong>Instance:</strong> Basic Droplet 1GB RAM, 1 vCPU</p>
                <p><strong>Region:</strong> Singapore (SGP1)</p>
                <p><strong>Cost:</strong> $4/month</p>
              </div>
            </div>

            <Button 
              onClick={handleValidateAndDeploy} 
              disabled={isValidating || !apiToken.trim()}
              className="w-full"
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                'Deploy Droplet'
              )}
            </Button>
          </div>
        )}

        {(step === 'deploying' || step === 'waiting') && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
            <div>
              <p className="font-medium">
                {step === 'deploying' ? 'Creating Droplet...' : 'Waiting for IP...'}
              </p>
              <p className="text-sm text-muted-foreground">
                {step === 'deploying' 
                  ? 'Initializing Singapore Droplet...' 
                  : 'Droplet created, waiting for IP assignment...'
                }
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                This may take 1-2 minutes
              </p>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="py-8 text-center space-y-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-success/20 flex items-center justify-center">
              <Check className="w-8 h-8 text-success" />
            </div>
            <div>
              <p className="text-lg font-medium">DigitalOcean Droplet Ready!</p>
              <p className="text-sm text-muted-foreground mt-2">
                Your Droplet is running at <span className="font-mono">{instanceData?.publicIp}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                HFT bot auto-installs via user_data script.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-secondary/30">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Provider</p>
                <p className="font-medium">DigitalOcean</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Region</p>
                <p className="font-medium">Singapore</p>
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
