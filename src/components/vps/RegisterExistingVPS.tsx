import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle, XCircle, Server } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Provider } from '@/types/cloudCredentials';

interface RegisterExistingVPSProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  defaultIp?: string;
  defaultProvider?: Provider;
}

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'vultr', label: 'Vultr' },
  { value: 'digitalocean', label: 'DigitalOcean' },
  { value: 'aws', label: 'AWS' },
  { value: 'contabo', label: 'Contabo' },
  { value: 'gcp', label: 'Google Cloud' },
  { value: 'azure', label: 'Azure' },
  { value: 'oracle', label: 'Oracle Cloud' },
  { value: 'alibaba', label: 'Alibaba Cloud' },
];

export function RegisterExistingVPS({
  open,
  onOpenChange,
  onSuccess,
  defaultIp = '',
  defaultProvider = 'vultr',
}: RegisterExistingVPSProps) {
  const [ipAddress, setIpAddress] = useState(defaultIp);
  const [provider, setProvider] = useState<Provider>(defaultProvider);
  const [nickname, setNickname] = useState('');
  const [region, setRegion] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null);

  const handleTestConnection = async () => {
    if (!ipAddress) {
      toast.error('Please enter an IP address');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // Try health check first (doesn't require storing keys in the browser)
      const { data, error } = await supabase.functions.invoke('check-vps-health', {
        body: { ipAddress },
      });

      if (error) throw error;

      if (data?.healthy) {
        setTestResult('success');
        toast.success('Connection successful! Server is healthy.');
        return;
      }

      // If not healthy, attempt a simple SSH echo *only* if this VPS is already registered
      // so the edge function can fetch the private key from `vps_instances` via instanceId.
      const { data: instance, error: instanceError } = await supabase
        .from('vps_instances')
        .select('id')
        .eq('ip_address', ipAddress)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (instanceError) throw instanceError;

      if (!instance?.id) {
        setTestResult('failed');
        toast.error('Register this VPS first, then re-run Test Connection to validate SSH.');
        return;
      }

      const { data: sshData, error: sshError } = await supabase.functions.invoke('ssh-command', {
        body: {
          instanceId: instance.id,
          command: 'echo "connected"',
          username: 'root',
          timeout: 15000,
        },
      });

      if (sshError || !sshData?.success) {
        setTestResult('failed');
        toast.error('SSH test failed. Verify the server allows key-based SSH for root.');
      } else {
        setTestResult('success');
        toast.success('SSH connection successful!');
      }
    } catch (err) {
      console.error('Test connection error:', err);
      setTestResult('failed');
      toast.error('Connection test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleRegister = async () => {
    if (!ipAddress) {
      toast.error('Please enter an IP address');
      return;
    }

    if (!provider) {
      toast.error('Please select a provider');
      return;
    }

    setIsRegistering(true);

    try {
      // Insert into vps_instances
      const { data: instance, error: insertError } = await supabase
        .from('vps_instances')
        .insert({
          ip_address: ipAddress,
          provider: provider,
          region: region || 'unknown',
          nickname: nickname || `${provider}-server`,
          status: 'running',
          bot_status: 'stopped',
          instance_size: 'unknown',
          monthly_cost: 0,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Also update vps_config for compatibility
      await supabase
        .from('vps_config')
        .upsert({
          provider: provider,
          outbound_ip: ipAddress,
          region: region || 'unknown',
          status: 'running',
        });

      toast.success('VPS registered successfully!');
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error('Register error:', err);
      toast.error('Failed to register VPS');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            Register Existing VPS
          </DialogTitle>
          <DialogDescription>
            Add an existing VPS server to your dashboard for monitoring and management.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="ip">IP Address *</Label>
            <Input
              id="ip"
              placeholder="e.g., 107.191.61.107"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider">Provider *</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nickname">Nickname (optional)</Label>
            <Input
              id="nickname"
              placeholder="e.g., Trading Bot #1"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="region">Region (optional)</Label>
            <Input
              id="region"
              placeholder="e.g., sgp, nyc, fra"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${
              testResult === 'success' 
                ? 'bg-success/10 text-success' 
                : 'bg-destructive/10 text-destructive'
            }`}>
              {testResult === 'success' ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm">Connection verified</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" />
                  <span className="text-sm">Connection failed</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={isTesting || !ipAddress}
            className="flex-1"
          >
            {isTesting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>
          <Button
            onClick={handleRegister}
            disabled={isRegistering || !ipAddress || !provider}
            className="flex-1"
          >
            {isRegistering ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Registering...
              </>
            ) : (
              'Register VPS'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
