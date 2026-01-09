import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Bot, Server, Play, Copy, CheckCircle2, Terminal, Zap, Code, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { IconContainer } from '@/components/ui/IconContainer';

interface JesseWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JesseWizard({ open, onOpenChange }: JesseWizardProps) {
  const [step, setStep] = useState(1);
  const [vpsId, setVpsId] = useState('');
  const [exchange, setExchange] = useState('Binance Futures');
  const [symbol, setSymbol] = useState('BTC-USDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [isDeploying, setIsDeploying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [vpsInstances, setVpsInstances] = useState<{ id: string; name: string; ip: string }[]>([]);

  useEffect(() => {
    const fetchVPS = async () => {
      const { data } = await supabase
        .from('vps_instances')
        .select('id, nickname, ip_address')
        .eq('status', 'running');
      if (data) {
        setVpsInstances(data.map(v => ({ id: v.id, name: v.nickname || 'VPS', ip: v.ip_address || '' })));
      }
    };
    fetchVPS();
  }, []);

  const installCommands = `# Install Jesse
pip install jesse

# Create new project
jesse make-project my-bot
cd my-bot

# Install project dependencies
pip install -r requirements.txt

# Import candles for backtesting
jesse import-candles '${exchange}' '${symbol}' '2023-01-01'

# Run backtest
jesse backtest '2023-01-01' '2023-12-31'`;

  const strategyTemplate = `from jesse.strategies import Strategy
import jesse.indicators as ta

class MyStrategy(Strategy):
    def should_long(self):
        # EMA crossover strategy
        ema_short = ta.ema(self.candles, 9)
        ema_long = ta.ema(self.candles, 21)
        return ema_short > ema_long

    def should_short(self):
        ema_short = ta.ema(self.candles, 9)
        ema_long = ta.ema(self.candles, 21)
        return ema_short < ema_long

    def should_cancel_entry(self):
        return False

    def go_long(self):
        qty = self.position_size
        self.buy = qty, self.price

    def go_short(self):
        qty = self.position_size
        self.sell = qty, self.price

    @property
    def position_size(self):
        return 0.1  # 10% of capital`;

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
          command: installCommands.split('\n').filter(l => !l.startsWith('#') && l.trim()).join(' && ')
        }
      });

      if (error) throw error;
      toast.success('Jesse installation started!');
      setStep(3);
    } catch (err) {
      console.error('Deploy error:', err);
      toast.error('Failed to install Jesse');
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-blue-500/30 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <IconContainer color="blue" size="lg">
              <FlaskConical className="w-6 h-6" />
            </IconContainer>
            <div>
              <DialogTitle className="text-xl">Jesse Trading Framework</DialogTitle>
              <DialogDescription>
                Deploy Jesse - Python framework for algo trading research
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
                  ? 'bg-blue-500 text-white' 
                  : 'bg-secondary text-muted-foreground'
              )}>
                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div className={cn(
                  "w-12 h-0.5 transition-colors",
                  step > s ? 'bg-blue-500' : 'bg-secondary'
                )} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: VPS Selection */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <h3 className="font-medium flex items-center gap-2 mb-2">
                <Server className="w-4 h-4 text-blue-400" />
                VPS Requirements
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 4GB+ RAM recommended</li>
                <li>• Python 3.9+ installed</li>
                <li>• pip package manager</li>
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/30">
              <h3 className="font-medium flex items-center gap-2 mb-2">
                <FlaskConical className="w-4 h-4 text-purple-400" />
                Jesse Features
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Advanced backtesting engine</li>
                <li>• Genetic algorithm optimization</li>
                <li>• Walk-forward validation</li>
                <li>• Multiple timeframe support</li>
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
                className="bg-blue-500 hover:bg-blue-600"
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Configuration */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Exchange</Label>
                <Select value={exchange} onValueChange={setExchange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Binance Futures">Binance Futures</SelectItem>
                    <SelectItem value="Bybit USDT Perpetual">Bybit Perpetual</SelectItem>
                    <SelectItem value="FTX Futures">FTX Futures</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Symbol</Label>
                <Input 
                  value={symbol} 
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="BTC-USDT"
                />
              </div>

              <div className="space-y-2">
                <Label>Timeframe</Label>
                <Select value={timeframe} onValueChange={setTimeframe}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1m">1 minute</SelectItem>
                    <SelectItem value="5m">5 minutes</SelectItem>
                    <SelectItem value="15m">15 minutes</SelectItem>
                    <SelectItem value="1h">1 hour</SelectItem>
                    <SelectItem value="4h">4 hours</SelectItem>
                    <SelectItem value="1D">1 day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Code className="w-4 h-4 text-blue-400" />
                  Strategy Template
                </Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleCopy(strategyTemplate)}
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <pre className="p-3 rounded-lg bg-black/50 text-xs text-blue-400 overflow-x-auto font-mono max-h-48 overflow-y-auto">
                {strategyTemplate}
              </pre>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Install Commands</Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleCopy(installCommands)}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <pre className="p-3 rounded-lg bg-black/50 text-xs text-green-400 overflow-x-auto font-mono">
                {installCommands}
              </pre>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleCopy(installCommands)}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Commands
                </Button>
                <Button 
                  onClick={handleDeploy}
                  disabled={isDeploying}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  {isDeploying ? (
                    <>Installing...</>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Install Now
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
            <h3 className="text-xl font-semibold">Jesse Installed!</h3>
            <p className="text-muted-foreground">
              Your algo trading research framework is ready.
            </p>

            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 text-left space-y-2">
              <p className="font-medium flex items-center gap-2">
                <Terminal className="w-4 h-4 text-blue-400" />
                Getting Started
              </p>
              <pre className="text-xs text-muted-foreground font-mono">
{`# Navigate to project
cd my-bot

# Create a new strategy
jesse make-strategy MyStrategy

# Edit strategy file
nano strategies/MyStrategy/__init__.py

# Run backtest
jesse backtest '2023-01-01' '2023-12-31'

# Optimize with genetics
jesse optimize '2023-01-01' '2023-12-31'

# Start live trading
jesse live`}
              </pre>
            </div>

            <Button onClick={() => onOpenChange(false)} className="bg-blue-500 hover:bg-blue-600">
              <Zap className="w-4 h-4 mr-2" />
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
