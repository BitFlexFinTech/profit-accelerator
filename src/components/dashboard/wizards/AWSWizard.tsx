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
  Server,
  Cloud,
  RefreshCw,
  AlertTriangle,
  Terminal,
  ClipboardCopy
} from 'lucide-react';
import { toast } from 'sonner';
import { generateSSHKeyPair, downloadKeyFile, type SSHKeyPair } from '@/utils/sshKeyGenerator';
import { supabase } from '@/integrations/supabase/client';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';

interface AWSWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WizardStep = 'welcome' | 'ssh' | 'userdata' | 'register' | 'success';

const AWS_SPECS = {
  instanceType: 't4g.micro',
  vcpus: 2,
  memoryGb: 1,
  region: 'ap-northeast-1',
  regionLabel: 'Tokyo (ap-northeast-1)',
  monthlyCost: 6.05,
  freeCredit: 200,
  architecture: 'ARM64 (Graviton2)',
};

const USER_DATA_SCRIPT = `#!/bin/bash
# HFT Bot Auto-Install for AWS EC2
# Region: Tokyo (ap-northeast-1)
# Paste this in: Advanced Details → User Data

apt-get update -qq && apt-get install -y curl
curl -sSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | bash

# Health check will be available at: http://<YOUR-IP>:8080/health`;

export function AWSWizard({ open, onOpenChange }: AWSWizardProps) {
  const [step, setStep] = useState<WizardStep>('welcome');
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [sshKeyPair, setSSHKeyPair] = useState<SSHKeyPair | null>(null);
  const [awsIp, setAwsIp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isScriptCopied, setIsScriptCopied] = useState(false);

  const creditMonths = Math.floor(AWS_SPECS.freeCredit / AWS_SPECS.monthlyCost);

  const resetWizard = () => {
    setStep('welcome');
    setIsGeneratingKey(false);
    setSSHKeyPair(null);
    setAwsIp('');
    setIsVerifying(false);
    setIsScriptCopied(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(resetWizard, 300);
  };

  const handleGenerateSSHKey = async () => {
    setIsGeneratingKey(true);
    try {
      const keyPair = await generateSSHKeyPair('aws-hft-bot');
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

  const copyUserDataScript = async () => {
    await navigator.clipboard.writeText(USER_DATA_SCRIPT);
    setIsScriptCopied(true);
    toast.success('User Data script copied!');
  };

  const verifyAndRegisterIP = async () => {
    if (!awsIp.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
      toast.error('Please enter a valid IP address');
      return;
    }

    setIsVerifying(true);

    try {
      // First, update cloud_config for AWS
      await supabase
        .from('cloud_config')
        .upsert({
          provider: 'aws',
          region: AWS_SPECS.region,
          instance_type: AWS_SPECS.instanceType,
          is_active: true,
          status: 'verifying',
          credentials: { ip: awsIp },
        }, { onConflict: 'provider' });

      // Try health check directly
      const healthUrl = `http://${awsIp}:8080/health`;
      console.log(`[AWSWizard] Checking health at: ${healthUrl}`);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(healthUrl, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const healthData = await response.json();
          console.log('[AWSWizard] Health response:', healthData);

          if (healthData.status === 'ok') {
            // Success! Insert into vps_config
            await supabase
              .from('vps_config')
              .upsert({
                provider: 'aws',
                outbound_ip: awsIp,
                region: AWS_SPECS.region,
                instance_type: AWS_SPECS.instanceType,
                status: 'running',
              }, { onConflict: 'provider' });

            // Update cloud_config to active
            await supabase
              .from('cloud_config')
              .update({ status: 'active' })
              .eq('provider', 'aws');

            // Enable trading
            await supabase
              .from('trading_config')
              .update({ bot_status: 'running', trading_enabled: true });

            toast.success('AWS instance verified and registered!');
            setStep('success');
          } else {
            toast.error('Health check returned unexpected status');
          }
        } else {
          toast.error(`Health check failed: HTTP ${response.status}`);
        }
      } catch (fetchError) {
        console.error('[AWSWizard] Health check failed:', fetchError);
        
        // Update status to indicate issue
        await supabase
          .from('cloud_config')
          .update({ status: 'health_check_failed' })
          .eq('provider', 'aws');

        toast.error('Could not reach health endpoint. Ensure port 8080 is open and the HFT bot is installed.');
      }
    } catch (error) {
      console.error('[AWSWizard] Error:', error);
      toast.error('Failed to register AWS instance');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="w-6 h-6 text-orange-500" />
            AWS EC2 Setup (Manual Deploy)
          </DialogTitle>
          <DialogDescription>
            Deploy a t4g.micro (ARM) instance in Tokyo via AWS Console
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-1 mb-4">
          {['welcome', 'ssh', 'userdata', 'register', 'success'].map((s, i) => (
            <div 
              key={s}
              className={`h-1.5 w-8 rounded-full transition-colors ${
                step === s ? 'bg-primary' : 
                ['welcome', 'ssh', 'userdata', 'register', 'success'].indexOf(step) > i 
                  ? 'bg-primary/50' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 'welcome' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30">
              <h3 className="font-semibold text-orange-400 mb-2 flex items-center gap-2">
                <Cloud className="w-4 h-4" />
                AWS Graviton2 (ARM64)
              </h3>
              <p className="text-sm text-muted-foreground">
                t4g.micro offers excellent price-performance for HFT workloads with ARM architecture.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-warning">💳 NEW ACCOUNT CREDIT</span>
                <span className="text-warning font-bold">${AWS_SPECS.freeCredit}</span>
              </div>
              <Progress value={100} className="h-2 mb-2" />
              <p className="text-xs text-muted-foreground">
                At ${AWS_SPECS.monthlyCost}/mo, your credit covers <strong className="text-accent">{creditMonths} months</strong> of 24/7 trading!
              </p>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <p className="text-xl font-bold text-primary">{AWS_SPECS.vcpus}</p>
                <p className="text-xs text-muted-foreground">vCPUs</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <p className="text-xl font-bold text-primary">{AWS_SPECS.memoryGb} GB</p>
                <p className="text-xs text-muted-foreground">RAM</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <p className="text-xl font-bold text-primary">ARM</p>
                <p className="text-xs text-muted-foreground">Arch</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <p className="text-xl font-bold text-accent">${AWS_SPECS.monthlyCost}</p>
                <p className="text-xs text-muted-foreground">/month</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 flex items-center gap-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Region: <strong className="text-accent">{AWS_SPECS.regionLabel}</strong></span>
            </div>

            <Button className="w-full" onClick={() => setStep('ssh')}>
              Continue
              <Rocket className="w-4 h-4 ml-2" />
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Don't have an AWS account?{' '}
              <a 
                href="https://aws.amazon.com/free/" 
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

        {/* Step 2: SSH Key Generation */}
        {step === 'ssh' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-secondary/30">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Key className="w-4 h-4 text-primary" />
                SSH Key Pair (Optional)
              </h3>
              <p className="text-sm text-muted-foreground">
                Generate a secure RSA key pair for EC2 SSH access, or use your own.
              </p>
            </div>

            {!sshKeyPair ? (
              <>
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
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setStep('userdata')}
                >
                  Skip (use existing key)
                </Button>
              </>
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
                  onClick={() => downloadKeyFile(sshKeyPair.privateKey, 'aws-hft-key.pem')}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Private Key
                </Button>

                <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                  <p className="text-xs text-warning">
                    ⚠️ Save your private key securely. It won't be shown again.
                  </p>
                </div>

                <Button className="w-full" onClick={() => setStep('userdata')}>
                  Continue
                </Button>
              </>
            )}
          </div>
        )}

        {/* Step 3: User Data Script */}
        {step === 'userdata' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-sky-500/10 border border-sky-500/30">
              <h3 className="font-semibold mb-2 flex items-center gap-2 text-sky-400">
                <Terminal className="w-4 h-4" />
                AWS User Data Script
              </h3>
              <p className="text-sm text-muted-foreground">
                Copy this script and paste it in AWS Console during instance creation.
              </p>
            </div>

            <div className="relative">
              <Textarea 
                value={USER_DATA_SCRIPT}
                readOnly
                className="text-xs font-mono h-40 bg-black/50 text-green-400 border-green-500/30"
              />
              <Button 
                size="sm"
                className={`absolute top-2 right-2 ${isScriptCopied ? 'bg-green-600' : ''}`}
                onClick={copyUserDataScript}
              >
                {isScriptCopied ? (
                  <>
                    <Check className="w-4 h-4 mr-1" />
                    Copied!
                  </>
                ) : (
                  <>
                    <ClipboardCopy className="w-4 h-4 mr-1" />
                    Copy Script
                  </>
                )}
              </Button>
            </div>

            <div className="p-4 rounded-lg bg-muted/50 space-y-3">
              <h4 className="font-medium text-sm">AWS Console Steps:</h4>
              <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Go to <a href="https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#LaunchInstances:" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">EC2 → Launch Instance (Tokyo)</a></li>
                <li>Select <strong>Ubuntu 24.04 LTS (ARM64)</strong> AMI</li>
                <li>Choose <strong>t4g.micro</strong> instance type</li>
                <li>In <strong>Advanced Details → User Data</strong>, paste the script above</li>
                <li>Configure Security Group: Allow <strong>SSH (22)</strong> and <strong>Custom TCP (8080)</strong></li>
                <li>Launch and wait for instance to start</li>
                <li>Copy the <strong>Public IPv4 address</strong> from the instance details</li>
              </ol>
            </div>

            <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
              <p className="text-xs text-warning flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                The HFT bot will auto-install on first boot (takes ~2-3 minutes)
              </p>
            </div>

            <Button className="w-full" onClick={() => setStep('register')}>
              I've Launched the Instance
              <Rocket className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {/* Step 4: Register IP */}
        {step === 'register' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Register AWS Instance
              </h3>
              <p className="text-sm text-muted-foreground">
                Enter your EC2 instance's public IP address to verify the health endpoint.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">EC2 Public IP Address</label>
              <Input 
                placeholder="e.g., 13.115.42.187"
                value={awsIp}
                onChange={(e) => setAwsIp(e.target.value)}
                className="font-mono mt-1"
              />
            </div>

            <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
              <p className="font-medium mb-1">We will verify:</p>
              <code className="text-primary">http://{awsIp || '<IP>'}:8080/health</code>
            </div>

            <Button 
              className="w-full" 
              onClick={verifyAndRegisterIP}
              disabled={isVerifying || !awsIp}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying Health...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Verify & Register
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Make sure your instance has been running for at least 2-3 minutes
            </p>
          </div>
        )}

        {/* Step 5: Success */}
        {step === 'success' && (
          <div className="space-y-4">
            <div className="p-6 rounded-lg bg-success/10 border border-success/30 text-center">
              <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
              <h3 className="font-semibold text-lg text-success mb-2">AWS Instance Connected!</h3>
              <p className="text-sm text-muted-foreground">
                Your AWS EC2 instance is now running in Tokyo.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground mb-1">Public IP Address</p>
              <div className="flex items-center justify-between">
                <code className="text-lg font-mono text-accent">{awsIp}</code>
                <Button 
                  size="icon" 
                  variant="ghost"
                  onClick={() => copyToClipboard(awsIp, 'IP address')}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <p className="font-medium mb-1">SSH Connection:</p>
              <code className="text-xs text-muted-foreground">
                ssh -i aws-hft-key.pem ubuntu@{awsIp}
              </code>
            </div>

            <div className="p-3 rounded-lg bg-sky-500/10 border border-sky-500/30">
              <p className="text-xs text-sky-400 flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3" />
                Next: Whitelist <strong>{awsIp}</strong> on your exchanges for balance fetching
              </p>
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
