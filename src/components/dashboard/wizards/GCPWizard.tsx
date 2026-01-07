import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Check, Copy, Terminal, AlertCircle, Key } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface GCPWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'credentials' | 'deploying' | 'installing' | 'success';

export function GCPWizard({ open, onOpenChange }: GCPWizardProps) {
  const [step, setStep] = useState<Step>('credentials');
  const [serviceAccountJson, setServiceAccountJson] = useState('');
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
    setServiceAccountJson('');
    setIsValidating(false);
    setIsDeploying(false);
    setInstanceData(null);
  };

  const handleValidateAndDeploy = async () => {
    if (!serviceAccountJson.trim()) {
      toast.error('Please paste your service account JSON');
      return;
    }

    // Validate JSON format
    try {
      const parsed = JSON.parse(serviceAccountJson);
      if (!parsed.project_id || !parsed.private_key || !parsed.client_email) {
        throw new Error('Missing required fields');
      }
    } catch {
      toast.error('Invalid service account JSON format');
      return;
    }

    setIsValidating(true);

    try {
      // Validate and deploy via edge function
      const { data: deployData, error: deployError } = await supabase.functions.invoke('gcp-cloud', {
        body: {
          action: 'deploy-instance',
          credentials: JSON.parse(serviceAccountJson),
          specs: { 
            zone: 'asia-northeast1-a',
            machineType: 'e2-micro'
          }
        }
      });

      if (deployError) throw deployError;

      if (!deployData?.success) {
        throw new Error(deployData?.error || 'Deployment failed');
      }

      // Require real deployment response - no fake IPs
      if (!deployData?.instanceId || !deployData?.publicIp) {
        throw new Error('Deployment failed - no instance data returned from GCP');
      }

      setIsValidating(false);
      setIsDeploying(true);
      setStep('deploying');

      setInstanceData({
        instanceId: deployData.instanceId,
        publicIp: deployData.publicIp,
      });

      // Register VPS in database with REAL data only
      await supabase.from('vps_config').upsert({
        provider: 'gcp',
        region: 'asia-northeast1',
        status: 'running',
        outbound_ip: deployData.publicIp,
        instance_type: 'e2-micro',
        updated_at: new Date().toISOString()
      }, { onConflict: 'provider' });

      // Update failover config
      await supabase.from('failover_config')
        .update({ 
          latency_ms: 0,
          consecutive_failures: 0,
          last_health_check: new Date().toISOString()
        })
        .eq('provider', 'gcp');

      // Send Telegram notification
      await supabase.functions.invoke('telegram-bot', {
        body: {
          action: 'send-message',
          message: `🚀 <b>VPS DEPLOYED: GCP Tokyo</b>\n\n✅ Status: Running\n🌐 IP: ${deployData.publicIp}\n📍 Region: asia-northeast1\n💰 Cost: FREE (Always Free tier)`
        }
      });

      setStep('installing');
      setIsDeploying(false);

    } catch (err: any) {
      console.error('GCP deployment error:', err);
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
        body: { ip: instanceData.publicIp, provider: 'gcp' }
      });

      if (error) throw error;

      if (data?.healthy) {
        await supabase.from('vps_config')
          .update({ status: 'running' })
          .eq('provider', 'gcp');

        setStep('success');
        toast.success('GCP VM connected and verified!');
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
            <span className="text-2xl">🔵</span>
            GCP Tokyo (Free Tier)
          </DialogTitle>
        </DialogHeader>

        {step === 'credentials' && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-success/10 border border-success/30">
              <p className="text-sm">
                Deploy an e2-micro VM in Tokyo using GCP's <strong>Always Free tier</strong> - $0/month!
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="serviceAccount" className="flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  Service Account JSON
                </Label>
                <Textarea
                  id="serviceAccount"
                  placeholder='{"type": "service_account", "project_id": "...", ...}'
                  value={serviceAccountJson}
                  onChange={(e) => setServiceAccountJson(e.target.value)}
                  className="font-mono text-xs h-32"
                />
                <p className="text-xs text-muted-foreground">
                  Create a service account in{' '}
                  <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    GCP IAM Console
                  </a>
                  {' '}with Compute Admin role.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-secondary/30 text-sm space-y-1">
                <p><strong>Instance:</strong> e2-micro (0.25 vCPU, 1GB RAM)</p>
                <p><strong>Zone:</strong> asia-northeast1-a (Tokyo)</p>
                <p><strong>Cost:</strong> <span className="text-success font-medium">FREE</span> (Always Free tier)</p>
              </div>
            </div>

            <Button 
              onClick={handleValidateAndDeploy} 
              disabled={isValidating || !serviceAccountJson.trim()}
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
              <p className="font-medium">Deploying GCP Compute Engine</p>
              <p className="text-sm text-muted-foreground">
                Creating e2-micro VM in Tokyo...
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
                <p className="text-sm font-medium">VM Created!</p>
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
                  SSH into your GCP VM and run the command below.
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
              <p className="text-lg font-medium">GCP VM Connected!</p>
              <p className="text-sm text-muted-foreground mt-2">
                Free tier HFT bot running on <span className="font-mono">{instanceData?.publicIp}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-secondary/30">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Provider</p>
                <p className="font-medium">GCP</p>
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
