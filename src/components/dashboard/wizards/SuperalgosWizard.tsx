import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Network, Copy, Check, ExternalLink, Terminal, 
  Rocket, Server, ChevronRight, AlertCircle, Zap
} from 'lucide-react';
import { toast } from 'sonner';

interface SuperalgosWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEPLOYMENT_STEPS = [
  {
    title: 'Clone Repository',
    description: 'Download Superalgos to your VPS',
    command: 'git clone https://github.com/Superalgos/Superalgos.git && cd Superalgos',
  },
  {
    title: 'Install Dependencies',
    description: 'Run the setup script',
    command: 'node setup',
  },
  {
    title: 'Start Platform',
    description: 'Launch Superalgos (runs on port 34248)',
    command: 'node platform',
  },
  {
    title: 'Configure Webhook',
    description: 'Add signal submission to your trading system',
    command: `// In your Superalgos Trading System, add this to Actions:
const signal = {
  bot_name: 'superalgos',
  symbol: tradingEngine.tradingCurrent.tradingEpisode.candle.symbol,
  side: tradingEngine.tradingCurrent.strategy.signal === 'Buy' ? 'long' : 'short',
  confidence: 75,
  exchange_name: 'binance'
};
fetch('SUPABASE_URL/functions/v1/bot-signal-receiver', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(signal)
});`,
  },
];

export function SuperalgosWizard({ open, onOpenChange }: SuperalgosWizardProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [vpsIp, setVpsIp] = useState('');

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Network className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <span>Superalgos Deployment</span>
              <Badge variant="outline" className="ml-2 text-xs">Visual Designer</Badge>
            </div>
          </DialogTitle>
          <DialogDescription>
            Deploy Superalgos visual trading platform to your VPS
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-orange-400 mt-0.5" />
                <div>
                  <p className="font-medium text-orange-400">Visual Trading System Designer</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Superalgos provides a node-based visual interface for designing complex trading strategies.
                    It includes data mining, backtesting, and live trading capabilities.
                  </p>
                </div>
              </div>
            </div>

            {/* VPS IP Input */}
            <div className="space-y-2">
              <Label>VPS IP Address (optional)</Label>
              <Input 
                placeholder="e.g., 139.180.xxx.xxx" 
                value={vpsIp}
                onChange={(e) => setVpsIp(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter your VPS IP to generate SSH commands
              </p>
            </div>

            {/* Deployment Steps */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                Deployment Steps
              </h3>

              {DEPLOYMENT_STEPS.map((step, index) => (
                <div key={index} className="p-4 rounded-lg bg-secondary/30 border border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </div>
                    <span className="font-medium">{step.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{step.description}</p>
                  <div className="relative">
                    <pre className="p-3 rounded bg-background/80 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                      {step.command}
                    </pre>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(step.command, index)}
                    >
                      {copiedIndex === index ? (
                        <Check className="w-4 h-4 text-success" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Features */}
            <div className="p-4 rounded-lg bg-secondary/30">
              <h4 className="font-medium mb-3">Key Features</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-primary" />
                  Visual node-based strategy designer
                </li>
                <li className="flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-primary" />
                  Built-in data mining and backtesting
                </li>
                <li className="flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-primary" />
                  Multi-exchange support (Binance, OKX, Bybit)
                </li>
                <li className="flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-primary" />
                  Open-source community strategies
                </li>
                <li className="flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-primary" />
                  Real-time trading signals to dashboard
                </li>
              </ul>
            </div>

            {/* Access Info */}
            <div className="p-4 rounded-lg border border-border/50">
              <div className="flex items-center gap-3">
                <Server className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Web Interface</p>
                  <p className="text-sm text-muted-foreground">
                    Access at <code className="px-1 py-0.5 rounded bg-secondary">http://{vpsIp || 'YOUR_VPS_IP'}:34248</code>
                  </p>
                </div>
              </div>
            </div>

            {/* Documentation Link */}
            <Button variant="outline" className="w-full" asChild>
              <a href="https://github.com/Superalgos/Superalgos" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" />
                View Documentation on GitHub
              </a>
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
