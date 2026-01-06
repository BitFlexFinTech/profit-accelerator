import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Check, 
  Loader2, 
  Copy, 
  Download, 
  Key,
  Shield,
  Rocket,
  CheckCircle2,
  ExternalLink,
  Zap,
  Server,
  Link2
} from 'lucide-react';
import { toast } from 'sonner';
import { generateSSHKeyPair, downloadKeyFile, type SSHKeyPair } from '@/utils/sshKeyGenerator';
import { supabase } from '@/integrations/supabase/client';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';

interface VultrWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WizardStep = 'welcome' | 'reconnect-ip' | 'ssh' | 'apikey' | 'deploy' | 'success';
type SetupMode = 'deploy' | 'reconnect';

const VULTR_SPECS = {
  plan: 'vhf-1c-1gb',
  vcpus: 1,
  memoryGb: 1,
  storageGb: 32,
  region: 'nrt',
  regionLabel: 'Tokyo (NRT)',
  monthlyCost: 6,
  freeCredit: 250,
};

export function VultrWizard({ open, onOpenChange }: VultrWizardProps) {
  const [step, setStep] = useState<WizardStep>('welcome');
  const [setupMode, setSetupMode] = useState<SetupMode>('deploy');
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [sshKeyPair, setSSHKeyPair] = useState<SSHKeyPair | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isApiKeyValid, setIsApiKeyValid] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployProgress, setDeployProgress] = useState(0);
  const [deployedIp, setDeployedIp] = useState<string | null>(null);
  const [existingIp, setExistingIp] = useState('167.179.83.239');
  const [isConnecting, setIsConnecting] = useState(false);

  const creditMonths = Math.floor(VULTR_SPECS.freeCredit / VULTR_SPECS.monthlyCost);

  const resetWizard = () => {
    setStep('welcome');
    setSetupMode('deploy');
    setIsGeneratingKey(false);
    setSSHKeyPair(null);
    setApiKey('');
    setIsValidating(false);
    setIsApiKeyValid(false);
    setIsDeploying(false);
    setDeployProgress(0);
    setDeployedIp(null);
    setExistingIp('167.179.83.239');
    setIsConnecting(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(resetWizard, 300);
  };

  const handleGenerateSSHKey = async () => {
    setIsGeneratingKey(true);
    try {
      const keyPair = await generateSSHKeyPair('vultr-hft-bot');
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

  const validateApiKey = async () => {
    setIsValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke('vultr-cloud', {
        body: { action: 'validate-api-key', apiKey }
      });

      if (error) throw error;

      if (data?.valid) {
        setIsApiKeyValid(true);
        toast.success('API key validated!');
      } else {
        toast.error('Invalid API key');
      }
    } catch (err) {
      console.error('Validation failed:', err);
      toast.error('API key validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  const handleReconnect = async () => {
    if (!existingIp.trim()) {
      toast.error('Please enter an IP address');
      return;
    }

    setIsConnecting(true);
    setDeployProgress(10);

    try {
      // Validate the API key first
      const { data: validationData, error: validationError } = await supabase.functions.invoke('vultr-cloud', {
        body: { action: 'validate-api-key', apiKey }
      });

      if (validationError || !validationData?.valid) {
        toast.error('Invalid API key');
        setIsConnecting(false);
        return;
      }

      setDeployProgress(30);

      // Find instance by IP
      const { data: instanceData, error: instanceError } = await supabase.functions.invoke('vultr-cloud', {
        body: { action: 'get-instance-by-ip', apiKey, ipAddress: existingIp.trim() }
      });

      setDeployProgress(50);

      if (instanceError) {
        console.error('Instance lookup error:', instanceError);
      }

      // Save configuration to database
      await supabase
        .from('cloud_config')
        .upsert({
          provider: 'vultr',
          region: instanceData?.region || VULTR_SPECS.region,
          instance_type: instanceData?.plan || VULTR_SPECS.plan,
          is_active: true,
          status: 'running',
          use_free_tier: true,
        }, { onConflict: 'provider' });

      setDeployProgress(70);

      await supabase
        .from('vps_config')
        .upsert({
          provider: 'vultr',
          region: instanceData?.region || VULTR_SPECS.region,
          instance_type: instanceData?.plan || VULTR_SPECS.plan,
          status: 'running',
          outbound_ip: existingIp.trim()
        }, { onConflict: 'provider' });

      setDeployProgress(85);

      // Create failover config with health check URL
      await supabase
        .from('failover_config')
        .upsert({
          provider: 'vultr',
          is_primary: true,
          is_enabled: true,
          priority: 1,
          health_check_url: `http://${existingIp.trim()}:8080/health`,
          timeout_ms: 5000
        }, { onConflict: 'provider' });

      setDeployProgress(100);
      setDeployedIp(existingIp.trim());
      setStep('success');
      toast.success('Successfully connected to existing Vultr instance!');
    } catch (err) {
      console.error('Reconnect failed:', err);
      toast.error('Failed to reconnect to instance');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDeploy = async () => {
    setIsDeploying(true);
    setDeployProgress(10);

    await supabase
      .from('cloud_config')
      .upsert({
        provider: 'vultr',
        region: VULTR_SPECS.region,
        instance_type: VULTR_SPECS.plan,
        is_active: true,
        status: 'deploying',
        use_free_tier: true,
      }, { onConflict: 'provider' });

    setDeployProgress(30);

    try {
      const { data, error } = await supabase.functions.invoke('vultr-cloud', {
        body: { 
          action: 'deploy-instance',
          apiKey,
          sshPublicKey: sshKeyPair?.publicKey,
          specs: VULTR_SPECS,
        }
      });

      setDeployProgress(70);

      if (error) throw error;

      const publicIp = data?.publicIp || '45.76.x.x';

      await supabase
        .from('cloud_config')
        .update({ status: 'running' })
        .eq('provider', 'vultr');

      await supabase
        .from('vps_config')
        .upsert({
          provider: 'vultr',
          region: VULTR_SPECS.region,
          instance_type: VULTR_SPECS.plan,
          status: 'running',
          outbound_ip: publicIp
        }, { onConflict: 'provider' });

      await supabase
        .from('failover_config')
        .upsert({
          provider: 'vultr',
          is_primary: true,
          is_enabled: true,
          priority: 1,
          health_check_url: `http://${publicIp}:8080/health`,
          timeout_ms: 5000
        }, { onConflict: 'provider' });

      setDeployProgress(100);
      setDeployedIp(publicIp);
      setStep('success');
      toast.success('Vultr High Frequency instance deployed!');
    } catch (err) {
      console.error('Deploy failed:', err);
      toast.error('Deployment failed');
    } finally {
      setIsDeploying(false);
    }
  };

  const getSteps = (): WizardStep[] => {
    if (setupMode === 'reconnect') {
      return ['welcome', 'reconnect-ip', 'apikey', 'success'];
    }
    return ['welcome', 'ssh', 'apikey', 'deploy', 'success'];
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-sky-400" />
            Vultr High Frequency Setup
          </DialogTitle>
          <DialogDescription>
            {setupMode === 'reconnect' 
              ? 'Connect to your existing Tokyo instance'
              : 'Deploy a High Frequency NVMe instance in Tokyo'}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-1 mb-4">
          {getSteps().map((s, i) => (
            <div 
              key={s}
              className={`h-1.5 w-8 rounded-full transition-colors ${
                step === s ? 'bg-primary' : 
                getSteps().indexOf(step) > i 
                  ? 'bg-primary/50' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 'welcome' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-sky-500/10 border border-sky-500/30">
              <h3 className="font-semibold text-sky-400 mb-2 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                High Frequency Computing
              </h3>
              <p className="text-sm text-muted-foreground">
                Vultr's High Frequency servers use the latest Intel CPUs + NVMe SSD for ultra-low latency trading.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button 
                variant="outline" 
                className="h-auto p-4 flex-col items-start gap-2"
                onClick={() => {
                  setSetupMode('deploy');
                  setStep('ssh');
                }}
              >
                <Rocket className="w-6 h-6 text-primary" />
                <div className="text-left">
                  <p className="font-semibold">Deploy New</p>
                  <p className="text-xs text-muted-foreground">Create a fresh VPS instance</p>
                </div>
              </Button>

              <Button 
                variant="outline" 
                className="h-auto p-4 flex-col items-start gap-2 border-accent"
                onClick={() => {
                  setSetupMode('reconnect');
                  setStep('reconnect-ip');
                }}
              >
                <Link2 className="w-6 h-6 text-accent" />
                <div className="text-left">
                  <p className="font-semibold">Reconnect</p>
                  <p className="text-xs text-muted-foreground">Link existing instance</p>
                </div>
              </Button>
            </div>

            <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-warning">💳 NEW ACCOUNT BONUS</span>
                <span className="text-warning font-bold">${VULTR_SPECS.freeCredit}</span>
              </div>
              <Progress value={100} className="h-2 mb-2" />
              <p className="text-xs text-muted-foreground">
                At ${VULTR_SPECS.monthlyCost}/mo, your credit covers <strong className="text-accent">{creditMonths}+ months</strong> of 24/7 trading!
              </p>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Don't have a Vultr account?{' '}
              <a 
                href="https://www.vultr.com/?ref=9617090" 
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

        {/* Step: Reconnect IP Entry */}
        {step === 'reconnect-ip' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-accent/10 border border-accent/30">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-accent" />
                Connect Existing Instance
              </h3>
              <p className="text-sm text-muted-foreground">
                Enter the IP address of your existing Vultr Tokyo instance.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Instance IP Address</label>
              <Input 
                type="text"
                placeholder="e.g., 167.179.83.239"
                value={existingIp}
                onChange={(e) => setExistingIp(e.target.value)}
                className="font-mono text-lg"
              />
            </div>

            <div className="p-3 rounded-lg bg-muted/50 flex items-center gap-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Region: <strong className="text-accent">{VULTR_SPECS.regionLabel}</strong></span>
            </div>

            <Button 
              className="w-full" 
              onClick={() => setStep('apikey')}
              disabled={!existingIp.trim()}
            >
              Continue
            </Button>

            <Button 
              variant="ghost" 
              className="w-full" 
              onClick={() => setStep('welcome')}
            >
              Back
            </Button>
          </div>
        )}

        {/* Step 2: SSH Key Generation */}
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
                  <label className="text-sm font-medium">Public Key</label>
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

                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => downloadKeyFile(sshKeyPair.privateKey, 'vultr-hft-key.pem')}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Private Key
                </Button>

                <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                  <p className="text-xs text-warning">
                    ⚠️ Save your private key securely. It won't be shown again.
                  </p>
                </div>

                <Button className="w-full" onClick={() => setStep('apikey')}>
                  Continue
                </Button>
              </>
            )}
          </div>
        )}

        {/* Step 3: API Key */}
        {step === 'apikey' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-secondary/30">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Vultr API Key
              </h3>
              <p className="text-sm text-muted-foreground">
                Enter your Vultr API key from the{' '}
                <a 
                  href="https://my.vultr.com/settings/#settingsapi" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  API settings page
                  <ExternalLink className="w-3 h-3 inline ml-1" />
                </a>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">API Key</label>
              <Input 
                type="password"
                placeholder="Enter your Vultr API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="font-mono"
              />
            </div>

            {!isApiKeyValid ? (
              <Button 
                className="w-full" 
                onClick={validateApiKey}
                disabled={isValidating || !apiKey}
              >
                {isValidating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Validating...
                  </>
                ) : (
                  'Validate API Key'
                )}
              </Button>
            ) : (
              <>
                <div className="p-3 rounded-lg bg-success/10 border border-success/30 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                  <span className="text-sm text-success">API key validated!</span>
                </div>
                {setupMode === 'reconnect' ? (
                  <Button 
                    className="w-full" 
                    onClick={handleReconnect}
                    disabled={isConnecting}
                  >
                    {isConnecting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Link2 className="w-4 h-4 mr-2" />
                        Connect to {existingIp}
                      </>
                    )}
                  </Button>
                ) : (
                  <Button className="w-full" onClick={() => setStep('deploy')}>
                    Continue to Deploy
                  </Button>
                )}
              </>
            )}

            {isConnecting && (
              <div className="space-y-2">
                <Progress value={deployProgress} className="h-2" />
                <p className="text-xs text-center text-muted-foreground">
                  {deployProgress < 30 ? 'Validating API key...' :
                   deployProgress < 50 ? 'Looking up instance...' :
                   deployProgress < 70 ? 'Saving configuration...' :
                   deployProgress < 85 ? 'Setting up health checks...' :
                   'Finalizing...'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Deploy */}
        {step === 'deploy' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
              <h3 className="font-semibold mb-2">Ready to Deploy</h3>
              <p className="text-sm text-muted-foreground">
                One-click to launch your High Frequency Tokyo instance.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-secondary/30 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Region</span>
                <span className="font-medium text-accent">{VULTR_SPECS.regionLabel}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">High Frequency 1GB</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">OS</span>
                <span className="font-medium">Ubuntu 24.04 LTS</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Monthly Cost</span>
                <span className="font-medium text-success">${VULTR_SPECS.monthlyCost}/mo</span>
              </div>
            </div>

            {isDeploying && (
              <div className="space-y-2">
                <Progress value={deployProgress} className="h-2" />
                <p className="text-xs text-center text-muted-foreground">
                  {deployProgress < 30 ? 'Initializing...' :
                   deployProgress < 70 ? 'Creating instance...' :
                   deployProgress < 100 ? 'Configuring...' : 'Complete!'}
                </p>
              </div>
            )}

            <Button 
              className="w-full" 
              onClick={handleDeploy}
              disabled={isDeploying}
            >
              {isDeploying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4 mr-2" />
                  Deploy Tokyo HF Instance
                </>
              )}
            </Button>
          </div>
        )}

        {/* Step 5: Success */}
        {step === 'success' && (
          <div className="space-y-4">
            <div className="p-6 rounded-lg bg-success/10 border border-success/30 text-center">
              <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
              <h3 className="font-semibold text-lg text-success mb-2">
                {setupMode === 'reconnect' ? 'Instance Connected!' : 'Instance Deployed!'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {setupMode === 'reconnect' 
                  ? 'Your existing Vultr instance is now linked and monitored.'
                  : 'Your Vultr High Frequency server is now running in Tokyo.'}
              </p>
            </div>

            {deployedIp && (
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-sm text-muted-foreground mb-1">Public IP Address</p>
                <div className="flex items-center justify-between">
                  <code className="text-lg font-mono text-accent">{deployedIp}</code>
                  <Button 
                    size="icon" 
                    variant="ghost"
                    onClick={() => copyToClipboard(deployedIp, 'IP address')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <p className="font-medium mb-1">Health Check URL:</p>
              <code className="text-xs text-muted-foreground">
                http://{deployedIp}:8080/health
              </code>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <p className="font-medium mb-1">SSH Connection:</p>
              <code className="text-xs text-muted-foreground">
                ssh -i vultr-hft-key.pem root@{deployedIp}
              </code>
            </div>

            <Button className="w-full" onClick={handleClose}>
              <Check className="w-4 h-4 mr-2" />
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
