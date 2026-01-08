import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Server, Loader2, Check, Copy, Terminal, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface ContaboWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'input' | 'install' | 'verifying' | 'success';

export function ContaboWizard({ open, onOpenChange }: ContaboWizardProps) {
  const [step, setStep] = useState<Step>('input');
  const [ipAddress, setIpAddress] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  const installCommand = `curl -sSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | sudo bash`;

  const handleReset = () => {
    setStep('input');
    setIpAddress('');
    setIsVerifying(false);
  };

  const handleTestConnection = async () => {
    if (!ipAddress.trim()) {
      toast.error('Please enter the VPS IP address');
      return;
    }

    // Validate IP format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ipAddress.trim())) {
      toast.error('Invalid IP address format (e.g., 192.168.1.1)');
      return;
    }

    // Validate each octet is 0-255
    const octets = ipAddress.trim().split('.').map(Number);
    if (octets.some(o => o < 0 || o > 255)) {
      toast.error('Invalid IP address - each number must be between 0 and 255');
      return;
    }

    setIsVerifying(true);
    
    try {
      // Try to check VPS health via edge function
      const { data, error } = await supabase.functions.invoke('check-vps-health', {
        body: { 
          ip: ipAddress.trim(),
          provider: 'contabo'
        }
      });

      if (error) throw error;

      if (data?.healthy) {
        // VPS is healthy - register it
        await registerVPS();
        setStep('success');
        toast.success('Contabo VPS connected successfully!');
      } else {
        // VPS not responding - show install instructions
        setStep('install');
        toast.info('VPS detected but HFT bot not installed. Run the install command.');
      }
    } catch (err: any) {
      // Connection failed - show install step
      setStep('install');
      toast.info('Could not reach VPS. Please install the HFT bot first.');
    } finally {
      setIsVerifying(false);
    }
  };

  const registerVPS = async () => {
    try {
      // Insert or update vps_config
      const { error: vpsError } = await supabase
        .from('vps_config')
        .upsert({
          provider: 'contabo',
          region: 'singapore',
          status: 'running',
          outbound_ip: ipAddress.trim(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (vpsError) throw vpsError;

      // Update trading config
      await supabase
        .from('trading_config')
        .update({ 
          bot_status: 'idle',
          updated_at: new Date().toISOString()
        })
        .eq('id', (await supabase.from('trading_config').select('id').single()).data?.id);

      // Sync IP to connected exchanges
      await syncIPWhitelist(ipAddress.trim());

    } catch (err: any) {
      console.error('Failed to register VPS:', err);
    }
  };

  const syncIPWhitelist = async (ip: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('sync-ip-whitelist', {
        body: { vps_ip: ip }
      });
      
      if (error) throw error;
      
      if (data?.exchanges_synced > 0) {
        toast.info(`IP registered for ${data.exchanges_synced} exchange(s). Whitelist manually.`);
      }
    } catch (err) {
      console.error('Failed to sync IP whitelist:', err);
    }
  };

  const handleVerifyInstallation = async () => {
    setIsVerifying(true);
    setStep('verifying');

    try {
      const { data, error } = await supabase.functions.invoke('check-vps-health', {
        body: { 
          ip: ipAddress.trim(),
          provider: 'contabo'
        }
      });

      if (error) throw error;

      if (data?.healthy) {
        await registerVPS();
        setStep('success');
        toast.success('Contabo VPS connected successfully!');
      } else {
        setStep('install');
        toast.error('HFT bot not responding. Please check the installation.');
      }
    } catch (err: any) {
      setStep('install');
      toast.error('Connection failed. Ensure the install script completed.');
    } finally {
      setIsVerifying(false);
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
            <Server className="w-5 h-5 text-primary" />
            Contabo Singapore VPS
          </DialogTitle>
        </DialogHeader>

        {step === 'input' && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
              <p className="text-sm">
                Enter your Contabo VPS IP address to connect it to the HFT trading system.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ip">VPS IP Address</Label>
                <Input
                  id="ip"
                  placeholder="e.g., 103.xxx.xxx.xxx"
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>

            <Button 
              onClick={handleTestConnection} 
              disabled={isVerifying || !ipAddress.trim()}
              className="w-full"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing Connection...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>
          </div>
        )}

        {step === 'install' && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-warning/10 border border-warning/30 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">HFT Bot Not Detected</p>
                <p className="text-xs text-muted-foreground mt-1">
                  SSH into your Contabo server and run the command below to install the HFT bot.
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
              <p className="text-xs text-muted-foreground">
                After running the command, click below to verify the installation:
              </p>
              <Button 
                onClick={handleVerifyInstallation} 
                disabled={isVerifying}
                className="w-full"
              >
                {isVerifying ? (
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
                onClick={handleReset}
                className="w-full"
              >
                Back
              </Button>
            </div>
          </div>
        )}

        {step === 'verifying' && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
            <div>
              <p className="font-medium">Verifying Installation</p>
              <p className="text-sm text-muted-foreground">
                Checking if HFT bot is running on {ipAddress}...
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
              <p className="text-lg font-medium">Contabo VPS Connected!</p>
              <p className="text-sm text-muted-foreground mt-2">
                Your HFT bot is now running on <span className="font-mono">{ipAddress}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-secondary/30">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Provider</p>
                <p className="font-medium">Contabo</p>
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
