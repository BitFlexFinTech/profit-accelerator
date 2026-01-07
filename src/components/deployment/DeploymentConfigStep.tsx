import { useState } from 'react';
import { Plus, Trash2, Rocket, DollarSign, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Provider, DeploymentConfig } from '@/types/cloudCredentials';

interface DeploymentConfigStepProps {
  provider: Provider;
  onNext: (config: DeploymentConfig) => void;
  onCancel: () => void;
}

// Region data per provider
const PROVIDER_REGIONS: Record<Provider, Array<{ id: string; name: string; latency: string }>> = {
  aws: [
    { id: 'us-east-1', name: 'US East (N. Virginia)', latency: '~5ms to NYSE' },
    { id: 'us-west-2', name: 'US West (Oregon)', latency: '~45ms to NYSE' },
    { id: 'eu-west-1', name: 'EU (Ireland)', latency: '~80ms to NYSE' },
    { id: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)', latency: '~150ms to NYSE' },
  ],
  digitalocean: [
    { id: 'nyc1', name: 'New York 1', latency: '~3ms to NYSE' },
    { id: 'nyc3', name: 'New York 3', latency: '~3ms to NYSE' },
    { id: 'sfo3', name: 'San Francisco 3', latency: '~50ms to NYSE' },
    { id: 'ams3', name: 'Amsterdam 3', latency: '~85ms to NYSE' },
    { id: 'sgp1', name: 'Singapore 1', latency: '~12ms to Binance' },
  ],
  vultr: [
    { id: 'ewr', name: 'New Jersey', latency: '~2ms to NYSE' },
    { id: 'ord', name: 'Chicago', latency: '~8ms to CME' },
    { id: 'lax', name: 'Los Angeles', latency: '~55ms to NYSE' },
    { id: 'sgp', name: 'Singapore', latency: '~10ms to Binance' },
    { id: 'nrt', name: 'Tokyo', latency: '~15ms to Binance' },
  ],
  contabo: [
    { id: 'EU1', name: 'Germany (Nuremberg)', latency: '~90ms to NYSE' },
    { id: 'US1', name: 'US Central (St. Louis)', latency: '~15ms to NYSE' },
    { id: 'SIN', name: 'Singapore', latency: '~8ms to Binance' },
  ],
  oracle: [
    { id: 'us-ashburn-1', name: 'US East (Ashburn)', latency: '~5ms to NYSE' },
    { id: 'us-phoenix-1', name: 'US West (Phoenix)', latency: '~40ms to NYSE' },
    { id: 'eu-frankfurt-1', name: 'Germany (Frankfurt)', latency: '~85ms to NYSE' },
  ],
  gcp: [
    { id: 'us-east4', name: 'N. Virginia', latency: '~4ms to NYSE' },
    { id: 'us-central1', name: 'Iowa', latency: '~20ms to NYSE' },
    { id: 'asia-southeast1', name: 'Singapore', latency: '~10ms to Binance' },
  ],
  alibaba: [
    { id: 'cn-hongkong', name: 'Hong Kong', latency: '~15ms to Binance' },
    { id: 'ap-southeast-1', name: 'Singapore', latency: '~8ms to Binance' },
    { id: 'us-west-1', name: 'US (Silicon Valley)', latency: '~50ms to NYSE' },
  ],
  azure: [
    { id: 'eastus', name: 'East US', latency: '~5ms to NYSE' },
    { id: 'westus2', name: 'West US 2', latency: '~55ms to NYSE' },
    { id: 'southeastasia', name: 'Southeast Asia', latency: '~12ms to Binance' },
  ],
};

// Instance size pricing (approximate)
const SIZE_PRICING: Record<string, { cpu: number; ram: number; storage: number; price: number }> = {
  small: { cpu: 2, ram: 4, storage: 25, price: 15 },
  medium: { cpu: 4, ram: 8, storage: 50, price: 45 },
  large: { cpu: 8, ram: 16, storage: 100, price: 90 },
};

const DEFAULT_ENV_VARS = [
  { key: 'EXCHANGE_API_KEY', value: '' },
  { key: 'EXCHANGE_SECRET', value: '' },
  { key: 'TRADING_PAIR', value: 'BTC/USDT' },
];

export function DeploymentConfigStep({ provider, onNext, onCancel }: DeploymentConfigStepProps) {
  const [size, setSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [region, setRegion] = useState(PROVIDER_REGIONS[provider][0]?.id || '');
  const [repoUrl, setRepoUrl] = useState('https://github.com/your-org/hft-bot');
  const [branch, setBranch] = useState('main');
  const [startCommand, setStartCommand] = useState('npm start');
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>(DEFAULT_ENV_VARS);
  const [enableMonitoring, setEnableMonitoring] = useState(true);
  const [enableBackups, setEnableBackups] = useState(true);
  const [customPorts, setCustomPorts] = useState('');
  const [additionalPackages, setAdditionalPackages] = useState('');

  const regions = PROVIDER_REGIONS[provider];
  const selectedRegion = regions.find(r => r.id === region);
  const pricing = SIZE_PRICING[size];
  const backupCost = enableBackups ? 5 : 0;
  const totalCost = pricing.price + backupCost;

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }]);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...envVars];
    updated[index][field] = value;
    setEnvVars(updated);
  };

  const handleSubmit = () => {
    const config: DeploymentConfig = {
      provider,
      region,
      size,
      repoUrl,
      branch,
      startCommand,
      envVars: Object.fromEntries(envVars.filter(v => v.key).map(v => [v.key, v.value])),
      allowedPorts: customPorts ? customPorts.split(',').map(p => parseInt(p.trim())).filter(Boolean) : undefined,
      enableMonitoring,
      enableBackups,
    };
    onNext(config);
  };

  return (
    <div className="space-y-6">
      {/* Instance Size */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Instance Size</Label>
        <RadioGroup value={size} onValueChange={(v) => setSize(v as any)} className="grid grid-cols-3 gap-3">
          <Label
            htmlFor="small"
            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer [&:has([data-state=checked])]:border-primary"
          >
            <RadioGroupItem value="small" id="small" className="sr-only" />
            <span className="font-semibold">Small</span>
            <span className="text-xs text-muted-foreground">2 vCPU, 4GB RAM</span>
            <span className="text-xs text-muted-foreground">25GB SSD</span>
            <span className="mt-2 font-medium text-green-500">~$15/mo</span>
          </Label>
          <Label
            htmlFor="medium"
            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer [&:has([data-state=checked])]:border-primary relative"
          >
            <RadioGroupItem value="medium" id="medium" className="sr-only" />
            <Badge className="absolute -top-2 bg-green-500">RECOMMENDED</Badge>
            <span className="font-semibold mt-2">Medium</span>
            <span className="text-xs text-muted-foreground">4 vCPU, 8GB RAM</span>
            <span className="text-xs text-muted-foreground">50GB SSD</span>
            <span className="mt-2 font-medium text-green-500">~$45/mo</span>
          </Label>
          <Label
            htmlFor="large"
            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer [&:has([data-state=checked])]:border-primary"
          >
            <RadioGroupItem value="large" id="large" className="sr-only" />
            <span className="font-semibold">Large</span>
            <span className="text-xs text-muted-foreground">8 vCPU, 16GB RAM</span>
            <span className="text-xs text-muted-foreground">100GB SSD</span>
            <span className="mt-2 font-medium text-green-500">~$90/mo</span>
          </Label>
        </RadioGroup>
      </div>

      {/* Region */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Region</Label>
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger>
            <SelectValue placeholder="Select region" />
          </SelectTrigger>
          <SelectContent>
            {regions.map(r => (
              <SelectItem key={r.id} value={r.id}>
                <div className="flex items-center justify-between w-full">
                  <span>{r.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{r.latency}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedRegion && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            Estimated latency: {selectedRegion.latency}
          </p>
        )}
      </div>

      {/* Bot Configuration */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Bot Configuration</Label>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Repository URL</Label>
            <Input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/your-org/bot"
            />
          </div>
          <div className="space-y-2">
            <Label>Branch</Label>
            <Input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Startup Command</Label>
          <Input
            value={startCommand}
            onChange={(e) => setStartCommand(e.target.value)}
            placeholder="npm start"
          />
        </div>

        {/* Environment Variables */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Environment Variables</Label>
            <Button type="button" variant="ghost" size="sm" onClick={addEnvVar}>
              <Plus className="h-4 w-4 mr-1" />
              Add Variable
            </Button>
          </div>
          <div className="space-y-2">
            {envVars.map((env, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="KEY"
                  value={env.key}
                  onChange={(e) => updateEnvVar(i, 'key', e.target.value)}
                  className="font-mono"
                />
                <Input
                  placeholder="value"
                  value={env.value}
                  onChange={(e) => updateEnvVar(i, 'value', e.target.value)}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeEnvVar(i)}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Advanced Options */}
      <Accordion type="single" collapsible>
        <AccordionItem value="advanced">
          <AccordionTrigger>Advanced Options</AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="monitoring"
                checked={enableMonitoring}
                onCheckedChange={(v) => setEnableMonitoring(!!v)}
              />
              <Label htmlFor="monitoring" className="cursor-pointer">
                Enable Monitoring (CPU, RAM, Network metrics)
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="backups"
                checked={enableBackups}
                onCheckedChange={(v) => setEnableBackups(!!v)}
              />
              <Label htmlFor="backups" className="cursor-pointer">
                Enable Auto-Backups (+$5/mo)
              </Label>
            </div>

            <div className="space-y-2">
              <Label>Custom Firewall Ports (comma-separated)</Label>
              <Input
                value={customPorts}
                onChange={(e) => setCustomPorts(e.target.value)}
                placeholder="8080, 3000, 443"
              />
            </div>

            <div className="space-y-2">
              <Label>Additional Packages (comma-separated)</Label>
              <Input
                value={additionalPackages}
                onChange={(e) => setAdditionalPackages(e.target.value)}
                placeholder="redis-server, nginx"
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Cost Summary */}
      <Card className="bg-muted/50">
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Cost Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Monthly Instance Cost</span>
              <span>${pricing.price.toFixed(2)}</span>
            </div>
            {enableBackups && (
              <div className="flex justify-between">
                <span>Backup Cost</span>
                <span>${backupCost.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t pt-1 mt-2">
              <span>Total</span>
              <span className="text-green-500">${totalCost.toFixed(2)}/month</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} className="bg-green-600 hover:bg-green-700">
          <Rocket className="h-4 w-4 mr-2" />
          🚀 Deploy Server (Fully Automated)
        </Button>
      </div>
    </div>
  );
}
