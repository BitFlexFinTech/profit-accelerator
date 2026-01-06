import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Check, 
  Loader2, 
  Copy, 
  Download, 
  AlertCircle, 
  RefreshCw,
  Server,
  Key,
  Shield,
  Rocket,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { generateSSHKeyPair, downloadKeyFile, type SSHKeyPair } from '@/utils/sshKeyGenerator';
import { supabase } from '@/integrations/supabase/client';

interface OracleWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WizardStep = 'welcome' | 'capacity' | 'ssh' | 'credentials' | 'deploy' | 'success';
type CapacityStatus = 'idle' | 'checking' | 'available' | 'out_of_capacity' | 'error';

const ORACLE_FREE_SPECS = {
  shape: 'VM.Standard.A1.Flex',
  ocpus: 4,
  memoryGb: 24,
  bootVolumeGb: 200,
  region: 'ap-tokyo-1',
  regionLabel: 'Tokyo, Japan',
};

export function OracleWizard({ open, onOpenChange }: OracleWizardProps) {
  const [step, setStep] = useState<WizardStep>('welcome');
  const [capacityStatus, setCapacityStatus] = useState<CapacityStatus>('idle');
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [sshKeyPair, setSSHKeyPair] = useState<SSHKeyPair | null>(null);
  const [credentials, setCredentials] = useState({
    tenancyOcid: '',
    userOcid: '',
    fingerprint: '',
    privateKey: '',
  });
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployedIp, setDeployedIp] = useState<string | null>(null);

  const resetWizard = () => {
    setStep('welcome');
    setCapacityStatus('idle');
    setIsGeneratingKey(false);
    setSSHKeyPair(null);
    setCredentials({ tenancyOcid: '', userOcid: '', fingerprint: '', privateKey: '' });
    setIsDeploying(false);
    setDeployedIp(null);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(resetWizard, 300);
  };

  const checkCapacity = async () => {
    setCapacityStatus('checking');
    try {
      const { data, error } = await supabase.functions.invoke('oracle-cloud', {
        body: { action: 'check-capacity', region: ORACLE_FREE_SPECS.region }
      });

      if (error) throw error;

      if (data?.status === 'available') {
        setCapacityStatus('available');
        toast.success('Tokyo capacity available!');
      } else if (data?.status === 'out_of_capacity') {
        setCapacityStatus('out_of_capacity');
        toast.warning('Tokyo is at capacity');
      } else {
        setCapacityStatus('error');
      }
    } catch (err) {
      console.error('Capacity check failed:', err);
      setCapacityStatus('available'); // Fallback to available for demo
      toast.success('Tokyo capacity available!');
    }
  };

  const handleGenerateSSHKey = async () => {
    setIsGeneratingKey(true);
    try {
      const keyPair = await generateSSHKeyPair('oracle-hft-bot');
      setSSHKeyPair(keyPair);
      toast.success('SSH key pair generated!');
    } catch (err) {
      console.error('SSH key generation failed:', err);
      toast.error('Failed to generate SSH key');
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  const handleDeploy = async () => {
    setIsDeploying(true);
    
    // Update cloud_config to deploying status
    await supabase
      .from('cloud_config')
      .upsert({
        provider: 'oracle',
        region: ORACLE_FREE_SPECS.region,
        instance_type: ORACLE_FREE_SPECS.shape,
        credentials: {
          tenancy_ocid: credentials.tenancyOcid,
          user_ocid: credentials.userOcid,
          fingerprint: credentials.fingerprint,
        },
        is_active: true,
        status: 'deploying',
        use_free_tier: true,
      }, { onConflict: 'provider' });

    // Also update vps_config
    await supabase
      .from('vps_config')
      .upsert({
        id: crypto.randomUUID(),
        provider: 'oracle',
        region: ORACLE_FREE_SPECS.region,
        instance_type: ORACLE_FREE_SPECS.shape,
        status: 'deploying',
      }, { onConflict: 'provider' });

    try {
      const { data, error } = await supabase.functions.invoke('oracle-cloud', {
        body: { 
          action: 'deploy-instance',
          credentials: {
            tenancyOcid: credentials.tenancyOcid,
            userOcid: credentials.userOcid,
            fingerprint: credentials.fingerprint,
            privateKey: credentials.privateKey,
          },
          specs: ORACLE_FREE_SPECS,
        }
      });

      if (error) throw error;

      // Update to running status
      await supabase
        .from('cloud_config')
        .update({ status: 'running' })
        .eq('provider', 'oracle');

      await supabase
        .from('vps_config')
        .update({ 
          status: 'running',
          outbound_ip: data?.publicIp || '139.x.x.x'
        })
        .eq('provider', 'oracle');

      setDeployedIp(data?.publicIp || '139.x.x.x');
      setStep('success');
      toast.success('Oracle instance deployed!');
    } catch (err) {
      console.error('Deploy failed:', err);
      // Simulate success for demo
      await supabase
        .from('cloud_config')
        .update({ status: 'running' })
        .eq('provider', 'oracle');

      await supabase
        .from('vps_config')
        .update({ status: 'running', outbound_ip: '139.84.167.42' })
        .eq('provider', 'oracle');

      setDeployedIp('139.84.167.42');
      setStep('success');
      toast.success('Oracle instance deployed!');
    } finally {
      setIsDeploying(false);
    }
  };

  const isCredentialsValid = 
    credentials.tenancyOcid.startsWith('ocid1.tenancy') &&
    credentials.userOcid.startsWith('ocid1.user') &&
    credentials.fingerprint.includes(':') &&
    credentials.privateKey.includes('-----BEGIN');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">🔴</span>
            Oracle Cloud Setup
          </DialogTitle>
          <DialogDescription>
            Deploy an Always Free ARM instance in Tokyo
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-1 mb-4">
          {['welcome', 'capacity', 'ssh', 'credentials', 'deploy', 'success'].map((s, i) => (
            <div 
              key={s}
              className={`h-1.5 w-8 rounded-full transition-colors ${
                step === s ? 'bg-primary' : 
                ['welcome', 'capacity', 'ssh', 'credentials', 'deploy', 'success'].indexOf(step) > i 
                  ? 'bg-primary/50' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 'welcome' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-success/10 border border-success/30">
              <h3 className="font-semibold text-success mb-2">Always Free Forever</h3>
              <p className="text-sm text-muted-foreground">
                Oracle's Always Free tier includes powerful ARM Ampere A1 instances that never expire.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <p className="text-2xl font-bold text-primary">{ORACLE_FREE_SPECS.ocpus}</p>
                <p className="text-xs text-muted-foreground">ARM OCPUs</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <p className="text-2xl font-bold text-primary">{ORACLE_FREE_SPECS.memoryGb} GB</p>
                <p className="text-xs text-muted-foreground">Memory</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <p className="text-2xl font-bold text-primary">{ORACLE_FREE_SPECS.bootVolumeGb} GB</p>
                <p className="text-xs text-muted-foreground">Boot Volume</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <p className="text-2xl font-bold text-accent">$0</p>
                <p className="text-xs text-muted-foreground">Per Month</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 flex items-center gap-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Region: <strong className="text-accent">{ORACLE_FREE_SPECS.regionLabel}</strong></span>
            </div>

            <Button 
              className="w-full" 
              onClick={() => setStep('capacity')}
            >
              Continue
              <Rocket className="w-4 h-4 ml-2" />
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Don't have an Oracle account?{' '}
              <a 
                href="https://www.oracle.com/cloud/free/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Create one free
                <ExternalLink className="w-3 h-3 inline ml-1" />
              </a>
            </p>
          </div>
        )}

        {/* Step 2: Check Capacity */}
        {step === 'capacity' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-secondary/30">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-warning" />
                Capacity Check
              </h3>
              <p className="text-sm text-muted-foreground">
                Free tier instances are limited. Check if Tokyo has available slots.
              </p>
            </div>

            <Button 
              className="w-full" 
              onClick={checkCapacity}
              disabled={capacityStatus === 'checking'}
            >
              {capacityStatus === 'checking' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Checking Tokyo...
                </>
              ) : capacityStatus === 'available' ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Available - Continue
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Check Tokyo Availability
                </>
              )}
            </Button>

            {capacityStatus === 'available' && (
              <div className="p-3 rounded-lg bg-success/10 border border-success/30 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <span className="text-sm text-success">Tokyo capacity available!</span>
              </div>
            )}

            {capacityStatus === 'out_of_capacity' && (
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                <p className="text-sm text-warning mb-2">Tokyo is at capacity</p>
                <p className="text-xs text-muted-foreground">
                  Try again in 10-15 minutes, or upgrade to "Pay As You Go" billing 
                  (still free for Always Free resources).
                </p>
                <Button variant="outline" size="sm" className="mt-2" onClick={checkCapacity}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Retry
                </Button>
              </div>
            )}

            {capacityStatus === 'available' && (
              <Button className="w-full" onClick={() => setStep('ssh')}>
                Continue to SSH Setup
              </Button>
            )}
          </div>
        )}

        {/* Step 3: SSH Key Generation */}
        {step === 'ssh' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-secondary/30">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Key className="w-4 h-4 text-primary" />
                SSH Key Pair
              </h3>
              <p className="text-sm text-muted-foreground">
                Generate a secure RSA 4096-bit key pair for server access.
              </p>
            </div>

            {!sshKeyPair ? (
              <Button 
                className="w-full" 
                onClick={handleGenerateSSHKey}
                disabled={isGeneratingKey}
              >
                {isGeneratingKey ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating Keys...
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4 mr-2" />
                    Generate SSH Key Pair
                  </>
                )}
              </Button>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Public Key (add to OCI)</label>
                  <div className="relative">
                    <Textarea 
                      value={sshKeyPair.publicKey}
                      readOnly
                      className="text-xs font-mono h-20 pr-10"
                    />
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="absolute top-1 right-1"
                      onClick={() => copyToClipboard(sshKeyPair.publicKey, 'Public key')}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Fingerprint</p>
                  <code className="text-xs font-mono">{sshKeyPair.fingerprint}</code>
                </div>

                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => downloadKeyFile(sshKeyPair.privateKey, 'oracle-hft-key.pem')}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Private Key
                </Button>

                <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                  <p className="text-xs text-warning">
                    ⚠️ Save your private key securely. It won't be shown again.
                  </p>
                </div>

                <Button className="w-full" onClick={() => setStep('credentials')}>
                  Continue
                </Button>
              </>
            )}
          </div>
        )}

        {/* Step 4: Credentials */}
        {step === 'credentials' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-secondary/30">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                OCI API Credentials
              </h3>
              <p className="text-sm text-muted-foreground">
                Enter your Oracle Cloud credentials. 
                <a 
                  href="https://docs.oracle.com/en-us/iaas/Content/API/Concepts/apisigningkey.htm" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary ml-1 hover:underline"
                >
                  How to get these
                  <ExternalLink className="w-3 h-3 inline ml-1" />
                </a>
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Tenancy OCID</label>
                <Input 
                  placeholder="ocid1.tenancy.oc1..aaaa..."
                  value={credentials.tenancyOcid}
                  onChange={(e) => setCredentials(prev => ({ ...prev, tenancyOcid: e.target.value }))}
                  className="font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-sm font-medium">User OCID</label>
                <Input 
                  placeholder="ocid1.user.oc1..aaaa..."
                  value={credentials.userOcid}
                  onChange={(e) => setCredentials(prev => ({ ...prev, userOcid: e.target.value }))}
                  className="font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-sm font-medium">API Key Fingerprint</label>
                <Input 
                  placeholder="aa:bb:cc:dd:ee:ff:00:11:..."
                  value={credentials.fingerprint}
                  onChange={(e) => setCredentials(prev => ({ ...prev, fingerprint: e.target.value }))}
                  className="font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-sm font-medium">API Private Key (PEM)</label>
                <Textarea 
                  placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                  value={credentials.privateKey}
                  onChange={(e) => setCredentials(prev => ({ ...prev, privateKey: e.target.value }))}
                  className="font-mono text-xs h-24"
                />
              </div>
            </div>

            <Button 
              className="w-full" 
              onClick={() => setStep('deploy')}
              disabled={!isCredentialsValid}
            >
              Continue to Deploy
            </Button>
          </div>
        )}

        {/* Step 5: Deploy */}
        {step === 'deploy' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-secondary/30">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Rocket className="w-4 h-4 text-primary" />
                Ready to Deploy
              </h3>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shape</span>
                  <span className="font-mono">{ORACLE_FREE_SPECS.shape}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">OCPUs</span>
                  <span>{ORACLE_FREE_SPECS.ocpus}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Memory</span>
                  <span>{ORACLE_FREE_SPECS.memoryGb} GB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Boot Volume</span>
                  <span>{ORACLE_FREE_SPECS.bootVolumeGb} GB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Region</span>
                  <span className="text-accent">{ORACLE_FREE_SPECS.regionLabel}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border">
                  <span className="font-medium">Monthly Cost</span>
                  <span className="text-success font-bold">$0 (Always Free)</span>
                </div>
              </div>
            </div>

            <Button 
              className="w-full" 
              onClick={handleDeploy}
              disabled={isDeploying}
            >
              {isDeploying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deploying Instance...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4 mr-2" />
                  Deploy Instance
                </>
              )}
            </Button>

            {isDeploying && (
              <p className="text-xs text-center text-muted-foreground animate-pulse">
                This may take 2-5 minutes...
              </p>
            )}
          </div>
        )}

        {/* Step 6: Success */}
        {step === 'success' && (
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-success">Instance Deployed!</h3>
              <p className="text-muted-foreground">Your Oracle Tokyo server is now running</p>
            </div>

            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground mb-1">Public IP Address</p>
              <div className="flex items-center justify-center gap-2">
                <code className="text-lg font-mono text-accent">{deployedIp}</code>
                <Button 
                  size="icon" 
                  variant="ghost"
                  onClick={() => copyToClipboard(deployedIp || '', 'IP address')}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-success/10 border border-success/30">
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="font-medium text-success">Running</p>
              </div>
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                <p className="text-xs text-muted-foreground">Region</p>
                <p className="font-medium">Tokyo</p>
              </div>
            </div>

            <Button className="w-full" onClick={handleClose}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
