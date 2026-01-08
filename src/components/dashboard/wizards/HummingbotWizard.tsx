import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Bot, Server, Play, Copy, CheckCircle2, Terminal, Zap, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { IconContainer } from '@/components/ui/IconContainer';

interface HummingbotWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HummingbotWizard({ open, onOpenChange }: HummingbotWizardProps) {
  const [step, setStep] = useState(1);
  const [vpsId, setVpsId] = useState('');
  const [exchange, setExchange] = useState('binance');
  const [tradingPair, setTradingPair] = useState('BTC-USDT');
  const [bidSpread, setBidSpread] = useState([0.5]);
  const [askSpread, setAskSpread] = useState([0.5]);
  const [orderAmount, setOrderAmount] = useState('100');
  const [isDeploying, setIsDeploying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [vpsInstances, setVpsInstances] = useState<{ id: string; name: string; ip: string }[]>([]);

  useEffect(() => {
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
  }, []);

  const dockerCommands = `# Pull Hummingbot Docker image
docker pull hummingbot/hummingbot:latest

# Create directories for config and logs
mkdir -p ~/hummingbot_conf ~/hummingbot_logs ~/hummingbot_data

# Run Hummingbot container
docker run -d \\
  --name hummingbot \\
  -v ~/hummingbot_conf:/home/hummingbot/conf \\
  -v ~/hummingbot_logs:/home/hummingbot/logs \\
  -v ~/hummingbot_data:/home/hummingbot/data \\
  -e CONFIG_PASSWORD=admin \\
  hummingbot/hummingbot:latest

# Attach to container
docker attach hummingbot`;

  const strategyConfig = `# Pure Market Making Strategy
strategy: pure_market_making
exchange: ${exchange}
market: ${tradingPair}

# Spreads
bid_spread: ${bidSpread[0]}
ask_spread: ${askSpread[0]}

# Order Amount
order_amount: ${orderAmount}

# Additional Settings
order_refresh_time: 30
filled_order_delay: 60
inventory_skew_enabled: true`;

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
          command: dockerCommands.split('\n').filter(l => !l.startsWith('#') && l.trim()).join(' && ')
        }
      });

      if (error) throw error;
      toast.success('Hummingbot deployment started!');
      setStep(3);
    } catch (err) {
      console.error('Deploy error:', err);
      toast.error('Failed to deploy Hummingbot');
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-teal-500/30 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <IconContainer color="teal" size="lg" animated>
              <TrendingUp className="w-6 h-6" />
            </IconContainer>
            <div>
              <DialogTitle className="text-xl">Hummingbot Wizard</DialogTitle>
              <DialogDescription>
                Deploy Hummingbot - Market making and arbitrage trading bot
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
                  ? 'bg-teal-500 text-white' 
                  : 'bg-secondary text-muted-foreground'
              )}>
                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div className={cn(
                  "w-12 h-0.5 transition-colors",
                  step > s ? 'bg-teal-500' : 'bg-secondary'
                )} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: VPS Selection */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-teal-500/10 border border-teal-500/30">
              <h3 className="font-medium flex items-center gap-2 mb-2">
                <Server className="w-4 h-4 text-teal-400" />
                VPS Requirements
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 4GB+ RAM recommended for market making</li>
                <li>• Docker installed</li>
                <li>• Low latency connection to exchanges</li>
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
                className="bg-teal-500 hover:bg-teal-600"
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Strategy Configuration */}
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
                    <SelectItem value="kucoin">KuCoin</SelectItem>
                    <SelectItem value="gate_io">Gate.io</SelectItem>
                    <SelectItem value="ascend_ex">AscendEX</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Trading Pair</Label>
                <Input 
                  value={tradingPair} 
                  onChange={(e) => setTradingPair(e.target.value)}
                  placeholder="BTC-USDT"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bid Spread: {bidSpread[0]}%</Label>
                <Slider 
                  value={bidSpread} 
                  onValueChange={setBidSpread}
                  min={0.1}
                  max={5}
                  step={0.1}
                  className="py-2"
                />
              </div>

              <div className="space-y-2">
                <Label>Ask Spread: {askSpread[0]}%</Label>
                <Slider 
                  value={askSpread} 
                  onValueChange={setAskSpread}
                  min={0.1}
                  max={5}
                  step={0.1}
                  className="py-2"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Order Amount (USDT)</Label>
              <Input 
                value={orderAmount} 
                onChange={(e) => setOrderAmount(e.target.value)}
                type="number"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Strategy Config</Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleCopy(strategyConfig)}
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <pre className="p-3 rounded-lg bg-black/50 text-xs text-teal-400 overflow-x-auto font-mono">
                {strategyConfig}
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
                  className="bg-teal-500 hover:bg-teal-600"
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
            <h3 className="text-xl font-semibold">Hummingbot Deployed!</h3>
            <p className="text-muted-foreground">
              Your market making bot is now running.
            </p>

            <div className="p-4 rounded-lg bg-teal-500/10 border border-teal-500/30 text-left space-y-2">
              <p className="font-medium flex items-center gap-2">
                <Terminal className="w-4 h-4 text-teal-400" />
                Next Steps
              </p>
              <pre className="text-xs text-muted-foreground font-mono">
{`# Attach to Hummingbot
docker attach hummingbot

# Inside Hummingbot, run:
connect ${exchange}
create
# Select: pure_market_making

# Start the bot:
start

# Detach (keep running):
Ctrl+P, Ctrl+Q`}
              </pre>
            </div>

            <Button onClick={() => onOpenChange(false)} className="bg-teal-500 hover:bg-teal-600">
              <Zap className="w-4 h-4 mr-2" />
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
