import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Check, Copy, Terminal, AlertCircle, Key } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface OracleWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'credentials' | 'deploying' | 'installing' | 'success';

export function OracleWizard({ open, onOpenChange }: OracleWizardProps) {
  const [step, setStep] = useState<Step>('credentials');
  const [tenancyOcid, setTenancyOcid] = useState('');
  const [userOcid, setUserOcid] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  const [privateKey, setPrivateKey] = useState('');
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
    setTenancyOcid('');
    setUserOcid('');
    setFingerprint('');
    setPrivateKey('');
    setIsValidating(false);
    setIsDeploying(false);
    setInstanceData(null);
  };

  const handleValidateAndDeploy = async () => {
    if (!tenancyOcid.trim() || !userOcid.trim() || !fingerprint.trim() || !privateKey.trim()) {
      toast.error('Please fill in all Oracle Cloud credentials');
      return;
    }

    setIsValidating(true);

    try {
      // Deploy via edge function
      const { data: deployData, error: deployError } = await supabase.functions.invoke('oracle-cloud', {
        body: {
          action: 'deploy-instance',
          credentials: {
            tenancyOcid: tenancyOcid.trim(),
            userOcid: userOcid.trim(),
            fingerprint: fingerprint.trim(),
            privateKey: privateKey.trim()
          },
          specs: { 
            region: 'ap-tokyo-1',
            shape: 'VM.Standard.A1.Flex',
            ocpus: 4,
            memoryGbs: 24
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
        instanceId: deployData.instanceId || 'oracle-tokyo-hft',
        publicIp: deployData.publicIp || '140.xxx.xxx.xxx',
      });

      // Register VPS in database
      await supabase.from('vps_config').upsert({
        provider: 'oracle',
        region: 'ap-tokyo-1',
        status: 'running',
        outbound_ip: deployData.publicIp,
        instance_type: 'VM.Standard.A1.Flex',
        updated_at: new Date().toISOString()
      }, { onConflict: 'provider' });

      // Update failover config
      await supabase.from('failover_config')
        .update({ 
          latency_ms: 0,
          consecutive_failures: 0,
          last_health_check: new Date().toISOString()
        })
        .eq('provider', 'oracle');

      // Send Telegram notification
      await supabase.functions.invoke('telegram-bot', {
        body: {
          action: 'send-message',
          message: `🚀 <b>VPS DEPLOYED: Oracle Cloud Tokyo</b>\n\n✅ Status: Running\n🌐 IP: ${deployData.publicIp}\n📍 Region: ap-tokyo-1\n💪 Specs: 4 OCPU, 24GB RAM (ARM64)\n💰 Cost: FREE (Always Free tier - BEST VALUE!)`
        }
      });

      setStep('installing');
      setIsDeploying(false);

    } catch (err: any) {
      console.error('Oracle deployment error:', err);
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
        body: { ip: instanceData.publicIp, provider: 'oracle' }
      });

      if (error) throw error;

      if (data?.healthy) {
        await supabase.from('vps_config')
          .update({ status: 'running' })
          .eq('provider', 'oracle');

        setStep('success');
        toast.success('Oracle Cloud VM connected and verified!');
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
            <span className="text-2xl">🔴</span>
            Oracle Cloud Tokyo (Free Tier)
          </DialogTitle>
        </DialogHeader>

        {step === 'credentials' && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-success/10 border border-success/30">
              <p className="text-sm">
                Deploy a powerful Ampere A1 instance using Oracle's <strong>Always Free tier</strong> - 
                4 OCPUs, 24GB RAM for $0/month! Best free VPS available.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tenancyOcid" className="flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  Tenancy OCID
                </Label>
                <Input
                  id="tenancyOcid"
                  placeholder="ocid1.tenancy.oc1..aaaa..."
                  value={tenancyOcid}
                  onChange={(e) => setTenancyOcid(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="userOcid">User OCID</Label>
                <Input
                  id="userOcid"
                  placeholder="ocid1.user.oc1..aaaa..."
                  value={userOcid}
                  onChange={(e) => setUserOcid(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fingerprint">API Key Fingerprint</Label>
                <Input
                  id="fingerprint"
                  placeholder="xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx"
                  value={fingerprint}
                  onChange={(e) => setFingerprint(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="privateKey">Private Key (PEM)</Label>
                <Textarea
                  id="privateKey"
                  placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  className="font-mono text-xs h-24"
                />
                <p className="text-xs text-muted-foreground">
                  Generate API keys in{' '}
                  <a href="https://cloud.oracle.com/identity/users" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    OCI Console → User Settings → API Keys
                  </a>
                </p>
              </div>

              <div className="p-3 rounded-lg bg-secondary/30 text-sm space-y-1">
                <p><strong>Instance:</strong> VM.Standard.A1.Flex (4 OCPUs, 24GB RAM)</p>
                <p><strong>Region:</strong> Tokyo (ap-tokyo-1)</p>
                <p><strong>Cost:</strong> <span className="text-success font-medium">FREE</span> (Always Free - Best value!)</p>
              </div>
            </div>

            <Button 
              onClick={handleValidateAndDeploy} 
              disabled={isValidating || !tenancyOcid.trim() || !userOcid.trim() || !fingerprint.trim() || !privateKey.trim()}
              className="w-full"
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                'Deploy Free Ampere A1'
              )}
            </Button>
          </div>
        )}

        {step === 'deploying' && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
            <div>
              <p className="font-medium">Deploying Oracle Cloud VM</p>
              <p className="text-sm text-muted-foreground">
                Creating Ampere A1 instance in Tokyo...
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                This may take 3-5 minutes
              </p>
            </div>
          </div>
        )}

        {step === 'installing' && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-success/10 border border-success/30 flex items-start gap-3">
              <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Ampere A1 Instance Created!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  IP: <span className="font-mono">{instanceData?.publicIp}</span>
                </p>
                <p className="text-xs text-success mt-1">
                  4 OCPUs, 24GB RAM - FREE!
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-warning/10 border border-warning/30 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Install HFT Bot</p>
                <p className="text-xs text-muted-foreground mt-1">
                  SSH into your Oracle VM and run the command below.
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
              <p className="text-lg font-medium">Oracle Cloud VM Connected!</p>
              <p className="text-sm text-muted-foreground mt-2">
                Powerful free tier running on <span className="font-mono">{instanceData?.publicIp}</span>
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 p-4 rounded-lg bg-secondary/30">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Provider</p>
                <p className="font-medium text-sm">Oracle</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Specs</p>
                <p className="font-medium text-sm">4 OCPU, 24GB</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Cost</p>
                <p className="font-medium text-sm text-success">FREE</p>
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
