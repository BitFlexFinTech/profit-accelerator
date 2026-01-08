import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Bot, Server, Play, Copy, CheckCircle2, Terminal, Zap, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { IconContainer } from '@/components/ui/IconContainer';

interface FreqtradeWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FreqtradeWizard({ open, onOpenChange }: FreqtradeWizardProps) {
  const [step, setStep] = useState(1);
  const [vpsId, setVpsId] = useState('');
  const [exchange, setExchange] = useState('binance');
  const [dryRun, setDryRun] = useState(true);
  const [strategy, setStrategy] = useState('SampleStrategy');
  const [isDeploying, setIsDeploying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [vpsInstances, setVpsInstances] = useState<{ id: string; name: string; ip: string }[]>([]);

  // Fetch VPS instances
  useState(() => {
    const fetchVPS = async () => {
      const { data } = await supabase
        .from('vps_instances')
        .select('id, name, ip_address')
        .eq('status', 'running');
      if (data) {
        setVpsInstances(data.map(v => ({ id: v.id, name: v.name || 'VPS', ip: v.ip_address || '' })));
      }
    };
    fetchVPS();
  });

  const dockerCommands = `# Create Freqtrade directory
mkdir -p ~/freqtrade && cd ~/freqtrade

# Download docker-compose.yml
curl https://raw.githubusercontent.com/freqtrade/freqtrade/stable/docker-compose.yml -o docker-compose.yml

# Create user_data directory
docker-compose run --rm freqtrade create-userdir --userdir user_data

# Create config file
docker-compose run --rm freqtrade new-config --config user_data/config.json

# Start Freqtrade
docker-compose up -d

# View logs
docker-compose logs -f`;

  const customConfig = `{
  "exchange": {
    "name": "${exchange}",
    "key": "YOUR_API_KEY",
    "secret": "YOUR_API_SECRET"
  },
  "dry_run": ${dryRun},
  "strategy": "${strategy}",
  "stake_currency": "USDT",
  "stake_amount": 100,
  "tradable_balance_ratio": 0.99
}`;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeploy = async () => {
    if (!vpsId) {
      toast.error('Please select a VPS');
      return;
    }

    setIsDeploying(true);
    try {
      const { error } = await supabase.functions.invoke('ssh-command', {
        body: {
          instanceId: vpsId,
          command: dockerCommands.split('\n').filter(l => !l.startsWith('#')).join(' && ')
        }
      });

      if (error) throw error;
      toast.success('Freqtrade deployment started!');
      setStep(3);
    } catch (err) {
      console.error('Deploy error:', err);
      toast.error('Failed to deploy Freqtrade');
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-sky-500/30 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <IconContainer color="cyan" size="lg" animated>
              <Bot className="w-6 h-6" />
            </IconContainer>
            <div>
              <DialogTitle className="text-xl">Freqtrade Bot Wizard</DialogTitle>
              <DialogDescription>
                Deploy Freqtrade - Python-based crypto trading bot with backtesting
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 my-4">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
                step >= s 
                  ? 'bg-sky-500 text-white' 
                  : 'bg-secondary text-muted-foreground'
              )}>
                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div className={cn(
                  "w-12 h-0.5 transition-colors",
                  step > s ? 'bg-sky-500' : 'bg-secondary'
                )} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: VPS Selection */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-sky-500/10 border border-sky-500/30">
              <h3 className="font-medium flex items-center gap-2 mb-2">
                <Server className="w-4 h-4 text-sky-400" />
                VPS Requirements
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 2GB+ RAM recommended</li>
                <li>• Docker & Docker Compose installed</li>
                <li>• Python 3.10+ (included in Docker)</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label>Select VPS Instance</Label>
              <Select value={vpsId} onValueChange={setVpsId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a VPS..." />
                </SelectTrigger>
                <SelectContent>
                  {vpsInstances.length === 0 ? (
                    <SelectItem value="none" disabled>No VPS available</SelectItem>
                  ) : (
                    vpsInstances.map((vps) => (
                      <SelectItem key={vps.id} value={vps.id}>
                        {vps.name} ({vps.ip})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button 
                onClick={() => setStep(2)} 
                disabled={!vpsId}
                className="bg-sky-500 hover:bg-sky-600"
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Configuration */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Exchange</Label>
                <Select value={exchange} onValueChange={setExchange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="binance">Binance</SelectItem>
                    <SelectItem value="bybit">Bybit</SelectItem>
                    <SelectItem value="okx">OKX</SelectItem>
                    <SelectItem value="kucoin">KuCoin</SelectItem>
                    <SelectItem value="kraken">Kraken</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Strategy</Label>
                <Input 
                  value={strategy} 
                  onChange={(e) => setStrategy(e.target.value)}
                  placeholder="SampleStrategy"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <div>
                <p className="font-medium">Dry Run Mode</p>
                <p className="text-sm text-muted-foreground">Simulate trades without real money</p>
              </div>
              <Switch checked={dryRun} onCheckedChange={setDryRun} />
            </div>

            {!dryRun && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5" />
                <p className="text-sm text-yellow-400">
                  Live trading enabled. Real funds will be used!
                </p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Docker Commands</Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleCopy(dockerCommands)}
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <pre className="p-3 rounded-lg bg-black/50 text-xs text-green-400 overflow-x-auto font-mono">
                {dockerCommands}
              </pre>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleCopy(dockerCommands)}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Commands
                </Button>
                <Button 
                  onClick={handleDeploy}
                  disabled={isDeploying}
                  className="bg-sky-500 hover:bg-sky-600"
                >
                  {isDeploying ? (
                    <>Deploying...</>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Deploy Now
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Complete */}
        {step === 3 && (
          <div className="space-y-4 text-center py-6">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-xl font-semibold">Freqtrade Deployed!</h3>
            <p className="text-muted-foreground">
              Your bot is now running. Check the logs for status.
            </p>

            <div className="p-4 rounded-lg bg-sky-500/10 border border-sky-500/30 text-left space-y-2">
              <p className="font-medium flex items-center gap-2">
                <Terminal className="w-4 h-4 text-sky-400" />
                Useful Commands
              </p>
              <pre className="text-xs text-muted-foreground font-mono">
{`# View logs
docker-compose logs -f

# Stop bot
docker-compose down

# Restart bot
docker-compose restart

# Access FreqUI (Web Interface)
# http://YOUR_VPS_IP:8080`}
              </pre>
            </div>

            <Button onClick={() => onOpenChange(false)} className="bg-sky-500 hover:bg-sky-600">
              <Zap className="w-4 h-4 mr-2" />
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
