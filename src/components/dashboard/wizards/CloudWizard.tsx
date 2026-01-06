import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Cloud, Loader2, CheckCircle2, Server, Lock, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useCloudConfig } from '@/hooks/useCloudConfig';
import { useRealtimeConfirmation } from '@/hooks/useRealtimeConfirmation';

interface CloudWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: 'digitalocean' | 'aws' | 'gcp' | null;
}

const PROVIDER_CONFIG = {
  digitalocean: {
    name: 'DigitalOcean',
    icon: '🌊',
    region: 'sgp1 (Singapore)',
    regionCode: 'sgp1',
    freeInstance: '$4/mo Shared Droplet',
    fields: [
      { id: 'token', label: 'Personal Access Token', type: 'password', placeholder: 'dop_v1_...' }
    ]
  },
  aws: {
    name: 'Amazon Web Services',
    icon: '☁️',
    region: 'ap-northeast-1 (Tokyo)',
    regionCode: 'ap-northeast-1',
    freeInstance: 't4g.micro (750 hrs/mo free)',
    fields: [
      { id: 'accessKey', label: 'Access Key ID', type: 'text', placeholder: 'AKIA...' },
      { id: 'secretKey', label: 'Secret Access Key', type: 'password', placeholder: '...' }
    ]
  },
  gcp: {
    name: 'Google Cloud',
    icon: '🔷',
    region: 'asia-northeast1 (Tokyo)',
    regionCode: 'asia-northeast1',
    freeInstance: 'e2-micro (Always Free)',
    fields: [
      { id: 'serviceAccount', label: 'Service Account JSON', type: 'textarea', placeholder: '{\n  "type": "service_account",\n  ...\n}' }
    ]
  }
};

export function CloudWizard({ open, onOpenChange, provider }: CloudWizardProps) {
  const { saveProviderConfig, getProviderConfig } = useCloudConfig();
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Realtime confirmation for optimistic UI
  const confirmation = useRealtimeConfirmation({
    table: 'cloud_config',
    matchColumn: 'provider',
    matchValue: provider || '',
    timeoutMs: 5000,
  });

  // Auto-advance to success when realtime confirms
  useEffect(() => {
    if (confirmation.isConfirmed && isSaving) {
      setIsSaving(false);
      setIsSuccess(true);
      toast.success(`${provider ? PROVIDER_CONFIG[provider].name : 'Provider'} configured successfully!`);
    }
  }, [confirmation.isConfirmed, isSaving, provider]);

  if (!provider) return null;

  const config = PROVIDER_CONFIG[provider];
  const existingConfig = getProviderConfig(provider);

  const handleSave = async () => {
    // Validate all fields are filled
    const missingFields = config.fields.filter(f => !credentials[f.id]?.trim());
    if (missingFields.length > 0) {
      toast.error(`Please fill in: ${missingFields.map(f => f.label).join(', ')}`);
      return;
    }

    setIsSaving(true);
    confirmation.startWaiting(); // Start listening for realtime confirmation
    
    const result = await saveProviderConfig(provider, credentials, {
      region: config.regionCode,
      useFreeTier: true
    });

    if (!result.success) {
      setIsSaving(false);
      confirmation.reset();
      toast.error(result.error || 'Failed to save configuration');
    }
    // Success is handled by the realtime confirmation effect
  };

  const handleClose = () => {
    setCredentials({});
    setIsSuccess(false);
    confirmation.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-primary/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="text-2xl">{config.icon}</span>
            {config.name} Setup
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {!isSuccess ? (
            <>
              {/* Region Lock Banner */}
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 flex items-center gap-3">
                <MapPin className="h-5 w-5 text-primary shrink-0" />
                <div className="text-sm">
                  <span className="font-medium">Region: </span>
                  <span className="text-muted-foreground">{config.region}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Locked to Tokyo for HFT latency optimization
                  </p>
                </div>
              </div>

              {/* Free Tier Info */}
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center gap-3">
                <Server className="h-5 w-5 text-green-500 shrink-0" />
                <div className="text-sm">
                  <span className="font-medium">Free Tier: </span>
                  <span className="text-muted-foreground">{config.freeInstance}</span>
                </div>
              </div>

              {/* Credential Fields */}
              <div className="space-y-4">
                {config.fields.map((field) => (
                  <div key={field.id} className="space-y-2">
                    <Label htmlFor={field.id}>{field.label}</Label>
                    {field.type === 'textarea' ? (
                      <Textarea
                        id={field.id}
                        placeholder={field.placeholder}
                        value={credentials[field.id] || ''}
                        onChange={(e) => setCredentials(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="bg-background/50 min-h-[120px] font-mono text-xs"
                      />
                    ) : (
                      <Input
                        id={field.id}
                        type={field.type}
                        placeholder={field.placeholder}
                        value={credentials[field.id] || ''}
                        onChange={(e) => setCredentials(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="bg-background/50"
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Security Note */}
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Lock className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Credentials are encrypted and stored securely. Never shared externally.</span>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSaving} className="flex-1">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {confirmation.isWaiting ? 'Connecting...' : 'Saving...'}
                    </>
                  ) : (
                    'Connect'
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-4 text-center">
              <div className="relative mx-auto w-16 h-16">
                <Cloud className="h-16 w-16 text-primary" />
                <CheckCircle2 className="h-6 w-6 text-green-500 absolute -bottom-1 -right-1" />
              </div>
              <h3 className="font-semibold text-lg">{config.name} Connected!</h3>
              <p className="text-sm text-muted-foreground">
                VPS infrastructure is ready for deployment
              </p>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Region:</span>
                  <span>{config.region}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Instance:</span>
                  <span>{config.freeInstance}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="text-green-500">Ready</span>
                </div>
              </div>
              <Button className="w-full" onClick={handleClose}>
                Done
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
