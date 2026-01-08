import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Check, Copy, Terminal, AlertCircle, Key } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface AlibabaWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'credentials' | 'deploying' | 'installing' | 'success';

export function AlibabaWizard({ open, onOpenChange }: AlibabaWizardProps) {
  const [step, setStep] = useState<Step>('credentials');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [accessKeySecret, setAccessKeySecret] = useState('');
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
        .select('field_name, encrypted_value')
        .eq('provider', 'alibaba');
      
      if (data) {
        data.forEach(row => {
          if (row.field_name === 'accesskey_id' && row.encrypted_value) setAccessKeyId(row.encrypted_value);
          if (row.field_name === 'accesskey_secret' && row.encrypted_value) setAccessKeySecret(row.encrypted_value);
        });
      }
    } catch (err) {
      console.error('[AlibabaWizard] Error loading credentials:', err);
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
    setAccessKeySecret('');
    setIsValidating(false);
    setIsDeploying(false);
    setInstanceData(null);
  };

  const handleValidateAndDeploy = async () => {
    if (!accessKeyId.trim() || !accessKeySecret.trim()) {
      toast.error('Please enter both Access Key ID and Secret');
      return;
    }

    // Alibaba Access Key ID format validation (starts with LTAI, ~24 chars)
    if (!accessKeyId.trim().match(/^LTAI[a-zA-Z0-9]{16,}$/)) {
      toast.error('Invalid Access Key ID format - should start with LTAI');
      return;
    }

    // Secret should be at least 20 characters
    if (accessKeySecret.trim().length < 20) {
      toast.error('Invalid Access Key Secret format - should be at least 20 characters');
      return;
    }

    setIsValidating(true);

    try {
      // Deploy via edge function
      const { data: deployData, error: deployError } = await supabase.functions.invoke('alibaba-cloud', {
        body: {
          action: 'deploy-instance',
          credentials: {
            accessKeyId: accessKeyId.trim(),
            accessKeySecret: accessKeySecret.trim()
          },
          specs: { 
            region: 'ap-northeast-1',
            instanceType: 'ecs.t6-c1m1.large'
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
        instanceId: deployData.instanceId || 'alibaba-tokyo-hft',
        publicIp: deployData.publicIp || '47.xxx.xxx.xxx',
      });

      // Register VPS in database
      await supabase.from('vps_config').upsert({
        provider: 'alibaba',
        region: 'ap-northeast-1',
        status: 'running',
        outbound_ip: deployData.publicIp,
        instance_type: 'ecs.t6-c1m1.large',
        updated_at: new Date().toISOString()
      }, { onConflict: 'provider' });

      // Update failover config
      await supabase.from('failover_config')
        .update({ 
          latency_ms: 0,
          consecutive_failures: 0,
          last_health_check: new Date().toISOString()
        })
        .eq('provider', 'alibaba');

      // Send Telegram notification
      await supabase.functions.invoke('telegram-bot', {
        body: {
          action: 'send-message',
          message: `🚀 <b>VPS DEPLOYED: Alibaba Cloud Tokyo</b>\n\n✅ Status: Running\n🌐 IP: ${deployData.publicIp}\n📍 Region: ap-northeast-1\n💰 Cost: ~$3/mo (Cheapest paid option!)`
        }
      });

      setStep('installing');
      setIsDeploying(false);

    } catch (err: any) {
      console.error('Alibaba deployment error:', err);
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
        body: { ip: instanceData.publicIp, provider: 'alibaba' }
      });

      if (error) throw error;

      if (data?.healthy) {
        await supabase.from('vps_config')
          .update({ status: 'running' })
          .eq('provider', 'alibaba');

        setStep('success');
        toast.success('Alibaba Cloud ECS connected and verified!');
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
            <span className="text-2xl">🟠</span>
            Alibaba Cloud Tokyo
          </DialogTitle>
        </DialogHeader>

        {step === 'credentials' && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
              <p className="text-sm">
                Deploy an ECS instance in Tokyo for ~$3/month - the cheapest paid cloud option with excellent Asia latency.
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
                  placeholder="LTAI5txxxxxxxxxxxxxxxx"
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accessKeySecret">Access Key Secret</Label>
                <Input
                  id="accessKeySecret"
                  type="password"
                  placeholder="Enter your Access Key Secret"
                  value={accessKeySecret}
                  onChange={(e) => setAccessKeySecret(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Create access keys in{' '}
                  <a href="https://ram.console.aliyun.com/manage/ak" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Alibaba Cloud RAM Console
                  </a>
                </p>
              </div>

              <div className="p-3 rounded-lg bg-secondary/30 text-sm space-y-1">
                <p><strong>Instance:</strong> ecs.t6-c1m1.large (1 vCPU, 1GB RAM)</p>
                <p><strong>Region:</strong> Tokyo (ap-northeast-1)</p>
                <p><strong>Cost:</strong> ~$3/month (Best budget option)</p>
              </div>
            </div>

            <Button 
              onClick={handleValidateAndDeploy} 
              disabled={isValidating || !accessKeyId.trim() || !accessKeySecret.trim()}
              className="w-full"
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                'Deploy ECS Instance'
              )}
            </Button>
          </div>
        )}

        {step === 'deploying' && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
            <div>
              <p className="font-medium">Deploying Alibaba Cloud ECS</p>
              <p className="text-sm text-muted-foreground">
                Creating instance in Tokyo...
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
                <p className="text-sm font-medium">ECS Instance Created!</p>
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
                  SSH into your ECS instance and run the command below.
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
              <p className="text-lg font-medium">Alibaba Cloud ECS Connected!</p>
              <p className="text-sm text-muted-foreground mt-2">
                Budget-friendly HFT bot on <span className="font-mono">{instanceData?.publicIp}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-secondary/30">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Provider</p>
                <p className="font-medium">Alibaba Cloud</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Cost</p>
                <p className="font-medium">~$3/mo</p>
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
