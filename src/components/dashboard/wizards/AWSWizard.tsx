import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Check, Copy, Terminal, AlertCircle, Key } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface AWSWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'credentials' | 'deploying' | 'installing' | 'success';

export function AWSWizard({ open, onOpenChange }: AWSWizardProps) {
  const [step, setStep] = useState<Step>('credentials');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [instanceData, setInstanceData] = useState<{
    instanceId: string;
    publicIp: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const installCommand = `curl -sSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | sudo bash`;

  // Load credentials from database when wizard opens
  const loadCredentialsFromDB = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('cloud_credentials')
        .select('field_name, encrypted_value, status')
        .eq('provider', 'aws');
      
      if (data) {
        data.forEach(row => {
          if (row.field_name === 'access_key_id' && row.encrypted_value) {
            setAccessKeyId(row.encrypted_value);
          }
          if (row.field_name === 'secret_access_key' && row.encrypted_value) {
            setSecretAccessKey(row.encrypted_value);
          }
        });
      }
    } catch (err) {
      console.error('[AWSWizard] Error loading credentials:', err);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadCredentialsFromDB();
    }
  }, [open, loadCredentialsFromDB]);

  const handleReset = () => {
    setStep('credentials');
    setAccessKeyId('');
    setSecretAccessKey('');
    setIsValidating(false);
    setIsDeploying(false);
    setInstanceData(null);
  };

  const handleValidateAndDeploy = async () => {
    if (!accessKeyId.trim() || !secretAccessKey.trim()) {
      toast.error('Please enter both Access Key ID and Secret Access Key');
      return;
    }

    // AWS Access Key ID format validation (starts with AKIA, 20 chars)
    if (!accessKeyId.trim().match(/^AKIA[A-Z0-9]{16}$/)) {
      toast.error('Invalid Access Key ID format - should start with AKIA and be 20 characters');
      return;
    }

    // AWS Secret Access Key is typically 40 characters
    if (secretAccessKey.trim().length < 30) {
      toast.error('Invalid Secret Access Key format - should be 40 characters');
      return;
    }

    setIsValidating(true);

    try {
      // Validate credentials
      const { data: validateData, error: validateError } = await supabase.functions.invoke('aws-cloud', {
        body: { 
          action: 'validate-credentials', 
          credentials: {
            accessKeyId: accessKeyId.trim(),
            secretAccessKey: secretAccessKey.trim()
          }
        }
      });

      if (validateError) throw validateError;

      if (!validateData?.valid) {
        toast.error('Invalid AWS credentials');
        setIsValidating(false);
        return;
      }

      toast.success('Credentials validated! Starting deployment...');
      setIsValidating(false);
      setIsDeploying(true);
      setStep('deploying');

      // Deploy instance
      const { data: deployData, error: deployError } = await supabase.functions.invoke('aws-cloud', {
        body: {
          action: 'deploy-instance',
          credentials: {
            accessKeyId: accessKeyId.trim(),
            secretAccessKey: secretAccessKey.trim()
          },
          specs: { 
            region: 'ap-northeast-1', 
            instanceType: 't4g.micro' 
          }
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
        provider: 'aws',
        region: 'ap-northeast-1',
        status: 'running',
        outbound_ip: deployData.publicIp,
        instance_type: 't4g.micro',
        updated_at: new Date().toISOString()
      }, { onConflict: 'provider' });

      // Update failover config
      await supabase.from('failover_config')
        .update({ 
          latency_ms: 0,
          consecutive_failures: 0,
          last_health_check: new Date().toISOString()
        })
        .eq('provider', 'aws');

      // Send Telegram notification
      await supabase.functions.invoke('telegram-bot', {
        body: {
          action: 'send-message',
          message: `🚀 <b>VPS DEPLOYED: AWS Tokyo</b>\n\n✅ Status: Running\n🌐 IP: ${deployData.publicIp}\n📍 Region: ap-northeast-1\n💰 Cost: $8.35/mo (Free Tier eligible)`
        }
      });

      setStep('installing');
      setIsDeploying(false);

    } catch (err: any) {
      console.error('AWS deployment error:', err);
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
        body: { ip: instanceData.publicIp, provider: 'aws' }
      });

      if (error) throw error;

      if (data?.healthy) {
        await supabase.from('vps_config')
          .update({ status: 'running' })
          .eq('provider', 'aws');

        setStep('success');
        toast.success('AWS EC2 instance connected and verified!');
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
            <span className="text-2xl">☁️</span>
            AWS Tokyo EC2
          </DialogTitle>
        </DialogHeader>

        {step === 'credentials' && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
              <p className="text-sm">
                Enter your AWS credentials to deploy a t4g.micro EC2 instance in Tokyo (ap-northeast-1).
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="accessKeyId" className="flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  Access Key ID
                </Label>
                <Input
                  id="accessKeyId"
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="secretAccessKey">Secret Access Key</Label>
                <Input
                  id="secretAccessKey"
                  type="password"
                  placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                  value={secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Create IAM credentials in{' '}
                  <a href="https://console.aws.amazon.com/iam/home#/security_credentials" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    AWS IAM Console
                  </a>
                </p>
              </div>

              <div className="p-3 rounded-lg bg-secondary/30 text-sm space-y-1">
                <p><strong>Instance:</strong> t4g.micro (ARM64, 2 vCPU, 1GB RAM)</p>
                <p><strong>Region:</strong> Tokyo (ap-northeast-1)</p>
                <p><strong>AMI:</strong> Ubuntu 24.04 ARM64</p>
                <p><strong>Cost:</strong> ~$8.35/mo (Free Tier: 750 hrs/mo first year)</p>
              </div>
            </div>

            <Button 
              onClick={handleValidateAndDeploy} 
              disabled={isValidating || !accessKeyId.trim() || !secretAccessKey.trim()}
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
              <p className="font-medium">Deploying AWS EC2 Instance</p>
              <p className="text-sm text-muted-foreground">
                Creating t4g.micro in Tokyo...
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                This may take 2-3 minutes
              </p>
            </div>
          </div>
        )}

        {step === 'installing' && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-success/10 border border-success/30 flex items-start gap-3">
              <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">EC2 Instance Created!</p>
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
                  SSH into your EC2 instance and run the command below.
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
              <p className="text-lg font-medium">AWS EC2 Connected!</p>
              <p className="text-sm text-muted-foreground mt-2">
                Your HFT bot is running on <span className="font-mono">{instanceData?.publicIp}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-secondary/30">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Provider</p>
                <p className="font-medium">AWS EC2</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Region</p>
                <p className="font-medium">Tokyo</p>
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
