import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Check, Copy, Terminal, AlertCircle, Key, Server } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface VultrWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'credentials' | 'checking' | 'deploying' | 'installing' | 'success';

export function VultrWizard({ open, onOpenChange }: VultrWizardProps) {
  const [step, setStep] = useState<Step>('credentials');
  const [apiKey, setApiKey] = useState('');
  const [existingIp, setExistingIp] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [instanceData, setInstanceData] = useState<{
    instanceId: string;
    publicIp: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const installCommand = `curl -sSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | sudo bash`;

  // Load existing Vultr config on open
  useEffect(() => {
    if (open) {
      loadExistingConfig();
    }
  }, [open]);

  const loadExistingConfig = async () => {
    try {
      const { data: vpsConfig } = await supabase
        .from('vps_config')
        .select('outbound_ip, provider, status')
        .eq('provider', 'vultr')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (vpsConfig?.outbound_ip) {
        setExistingIp(vpsConfig.outbound_ip);
        console.log('[VultrWizard] Pre-filled existing IP:', vpsConfig.outbound_ip);
      }
    } catch (err) {
      console.error('[VultrWizard] Failed to load existing config:', err);
    }
  };

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
    
    if (apiKey.trim().length < 30) {
      toast.error('Invalid API key format - Vultr keys are typically 36+ characters');
      return;
    }

    setIsValidating(true);

    try {
      // Step 1: Validate API key
      const { data: validateData, error: validateError } = await supabase.functions.invoke('vultr-cloud', {
        body: { action: 'validate-api-key', apiKey: apiKey.trim() }
      });

      if (validateError) throw validateError;

      if (!validateData?.valid) {
        toast.error('Invalid Vultr API key');
        setIsValidating(false);
        return;
      }

      toast.success('API key validated!');

      // Step 2: Check if existing server IP was provided
      if (existingIp.trim()) {
        setStep('checking');
        console.log('[VultrWizard] Checking for existing instance at IP:', existingIp);

        const { data: existingData, error: existingError } = await supabase.functions.invoke('vultr-cloud', {
          body: { action: 'get-instance-by-ip', apiKey: apiKey.trim(), ipAddress: existingIp.trim() }
        });

        if (!existingError && existingData?.found) {
          console.log('[VultrWizard] Found existing instance:', existingData);
          toast.success('Found existing Vultr instance!');

          setInstanceData({
            instanceId: existingData.instanceId,
            publicIp: existingData.publicIp,
          });

          // Upsert vps_config - THROW on error to ensure persistence
          const { error: configError } = await supabase.from('vps_config').upsert({
            provider: 'vultr',
            region: existingData.region || 'tokyo',
            status: 'running',
            outbound_ip: existingData.publicIp,
            updated_at: new Date().toISOString()
          }, { onConflict: 'provider' });
          
          if (configError) {
            console.error('[VultrWizard] vps_config upsert error:', configError);
            throw new Error(`Failed to save VPS config: ${configError.message}`);
          }
          console.log('[VultrWizard] vps_config saved successfully');

          // Upsert vps_instances - THROW on error
          const { error: instanceError } = await supabase.from('vps_instances').upsert({
            provider: 'vultr',
            provider_instance_id: existingData.instanceId,
            ip_address: existingData.publicIp,
            status: 'running',
            region: existingData.region || 'tokyo',
            instance_size: existingData.plan || 'vhf-1c-1gb',
            nickname: existingData.label || 'Tokyo HFT Bot',
            updated_at: new Date().toISOString()
          }, { onConflict: 'provider_instance_id' });

          if (instanceError) {
            console.error('[VultrWizard] vps_instances upsert error:', instanceError);
            throw new Error(`Failed to save VPS instance: ${instanceError.message}`);
          }
          console.log('[VultrWizard] vps_instances saved successfully');
          
          // Update failover_config for Vultr
          await supabase.from('failover_config').upsert({
            provider: 'vultr',
            is_primary: true,
            is_enabled: true,
            last_health_check: new Date().toISOString(),
            region: existingData.region || 'tokyo'
          }, { onConflict: 'provider' });
          
          toast.success('VPS configuration saved to database!');

          setIsValidating(false);

          // Now verify if the bot is installed by checking health
          await verifyBotHealth(existingData.publicIp);
          return;
        } else {
          console.log('[VultrWizard] No existing instance found at IP, will deploy new');
          toast.info('No existing instance found at that IP. Deploying new server...');
        }
      }

      // Step 3: Deploy new instance (only if no existing found)
      setIsValidating(false);
      setIsDeploying(true);
      setStep('deploying');

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

      // Register VPS in database - THROW on error
      const { error: newConfigError } = await supabase.from('vps_config').upsert({
        provider: 'vultr',
        region: 'tokyo',
        status: 'running',
        outbound_ip: deployData.publicIp,
        updated_at: new Date().toISOString()
      }, { onConflict: 'provider' });
      
      if (newConfigError) {
        throw new Error(`Failed to save VPS config: ${newConfigError.message}`);
      }

      // Send Telegram notification
      await supabase.functions.invoke('telegram-bot', {
        body: {
          action: 'send-message',
          message: `🚀 <b>VPS DEPLOYED: Vultr Tokyo</b>\n\n✅ Status: Running\n🌐 IP: ${deployData.publicIp}\n📍 Region: Tokyo NRT\n💰 Cost: $5/mo`
        }
      });

      setIsDeploying(false);
      // Go to manual install step (no auto SSH to avoid errors)
      setStep('installing');
      toast.success('Server deployed! Please install the HFT bot manually.');

    } catch (err: any) {
      console.error('Vultr deployment error:', err);
      toast.error(`Failed: ${err.message}`);
      setIsValidating(false);
      setIsDeploying(false);
      setStep('credentials');
    }
  };

  const verifyBotHealth = async (ip: string) => {
    setIsDeploying(true);

    try {
      const { data, error } = await supabase.functions.invoke('check-vps-health', {
        body: { ipAddress: ip }
      });

      if (error) throw error;

      if (data?.healthy) {
        await supabase.from('vps_config')
          .update({ status: 'running' })
          .eq('provider', 'vultr');

        setStep('success');
        toast.success('Vultr VPS verified - bot is running!');
      } else {
        // Bot not running, show install instructions
        setStep('installing');
        toast.info('Server found but bot not responding. Please verify installation.');
      }
    } catch (err: any) {
      console.error('Health check error:', err);
      setStep('installing');
      toast.info('Could not verify bot health. Please check installation.');
    } finally {
      setIsDeploying(false);
    }
  };

  const handleVerifyInstallation = async () => {
    if (!instanceData?.publicIp) return;
    await verifyBotHealth(instanceData.publicIp);
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
                Enter your Vultr API key. If you already have a server, enter its IP to adopt it.
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

              <div className="space-y-2">
                <Label htmlFor="existingIp" className="flex items-center gap-2">
                  <Server className="w-4 h-4" />
                  Existing Server IP (optional)
                </Label>
                <Input
                  id="existingIp"
                  type="text"
                  placeholder="e.g. 107.191.61.107"
                  value={existingIp}
                  onChange={(e) => setExistingIp(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  If you already created a Vultr server, enter its IP to adopt it instead of deploying new.
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

        {step === 'checking' && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
            <div>
              <p className="font-medium">Checking Existing Server</p>
              <p className="text-sm text-muted-foreground">
                Looking for instance at {existingIp}...
              </p>
            </div>
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

        {step === 'installing' && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-success/10 border border-success/30 flex items-start gap-3">
              <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Instance Ready!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  IP: <span className="font-mono">{instanceData?.publicIp || existingIp}</span>
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
                Your HFT bot is running on <span className="font-mono">{instanceData?.publicIp || existingIp}</span>
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
