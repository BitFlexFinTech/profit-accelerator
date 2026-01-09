import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart3, Copy, Check, ExternalLink, Terminal, 
  Code, ChevronRight, Zap, PlayCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface BacktraderWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const INSTALL_COMMANDS = [
  {
    title: 'Install Backtrader',
    command: 'pip install backtrader[plotting]',
  },
  {
    title: 'Install CCXT for Exchange Data',
    command: 'pip install ccxt pandas numpy',
  },
  {
    title: 'Install Requests for Signal Submission',
    command: 'pip install requests',
  },
];

const STRATEGY_TEMPLATE = `import backtrader as bt
import requests

SUPABASE_URL = "https://iibdlazwkossyelyroap.supabase.co"

class SignalStrategy(bt.Strategy):
    """Mean Reversion Strategy with Signal Submission"""
    
    params = (
        ('period', 20),
        ('devfactor', 2.0),
        ('signal_threshold', 75),
    )
    
    def __init__(self):
        self.boll = bt.indicators.BollingerBands(
            self.data.close,
            period=self.p.period,
            devfactor=self.p.devfactor
        )
        self.rsi = bt.indicators.RSI(self.data.close, period=14)
    
    def submit_signal(self, side, confidence):
        """Submit trading signal to central dashboard"""
        try:
            signal = {
                'bot_name': 'backtrader',
                'symbol': self.data._name.replace('/', '') + 'USDT',
                'side': side,
                'confidence': confidence,
                'current_price': float(self.data.close[0]),
                'exchange_name': 'binance'
            }
            requests.post(
                f'{SUPABASE_URL}/functions/v1/bot-signal-receiver',
                json=signal,
                timeout=5
            )
            print(f"[Backtrader] Signal submitted: {side} {signal['symbol']}")
        except Exception as e:
            print(f"[Backtrader] Signal error: {e}")
    
    def next(self):
        # Mean reversion: buy when price touches lower band
        if self.data.close[0] < self.boll.lines.bot[0] and self.rsi[0] < 30:
            if not self.position:
                self.buy()
                self.submit_signal('long', min(95, 50 + (30 - self.rsi[0])))
        
        # Sell when price touches upper band
        elif self.data.close[0] > self.boll.lines.top[0] and self.rsi[0] > 70:
            if self.position:
                self.sell()
                self.submit_signal('short', min(95, 50 + (self.rsi[0] - 70)))

# Run backtest
if __name__ == '__main__':
    import ccxt
    import pandas as pd
    
    cerebro = bt.Cerebro()
    cerebro.addstrategy(SignalStrategy)
    
    # Fetch data from exchange
    exchange = ccxt.binance()
    ohlcv = exchange.fetch_ohlcv('BTC/USDT', '1h', limit=500)
    df = pd.DataFrame(ohlcv, columns=['datetime', 'open', 'high', 'low', 'close', 'volume'])
    df['datetime'] = pd.to_datetime(df['datetime'], unit='ms')
    df.set_index('datetime', inplace=True)
    
    data = bt.feeds.PandasData(dataname=df)
    cerebro.adddata(data, name='BTC')
    
    cerebro.broker.setcash(10000)
    cerebro.broker.setcommission(commission=0.001)
    
    print(f'Starting Portfolio: \${cerebro.broker.getvalue():,.2f}')
    cerebro.run()
    print(f'Final Portfolio: \${cerebro.broker.getvalue():,.2f}')
    
    # Plot results
    cerebro.plot()
`;

export function BacktraderWizard({ open, onOpenChange }: BacktraderWizardProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedStrategy, setCopiedStrategy] = useState(false);

  const copyToClipboard = (text: string, index?: number) => {
    navigator.clipboard.writeText(text);
    if (index !== undefined) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } else {
      setCopiedStrategy(true);
      setTimeout(() => setCopiedStrategy(false), 2000);
    }
    toast.success('Copied to clipboard');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <span>Backtrader Setup</span>
              <Badge variant="outline" className="ml-2 text-xs">Python Backtesting</Badge>
            </div>
          </DialogTitle>
          <DialogDescription>
            Professional-grade backtesting framework with live trading integration
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="install" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="install">Installation</TabsTrigger>
            <TabsTrigger value="strategy">Strategy Template</TabsTrigger>
          </TabsList>

          <TabsContent value="install">
            <ScrollArea className="h-[55vh] pr-4">
              <div className="space-y-6">
                {/* Info Banner */}
                <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-yellow-400 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-400">Python Backtesting Framework</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Backtrader is a feature-rich Python framework for backtesting and live trading.
                        It supports multiple data feeds, brokers, and complex strategy logic.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Installation Commands */}
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Terminal className="w-4 h-4" />
                    Installation
                  </h3>

                  {INSTALL_COMMANDS.map((cmd, index) => (
                    <div key={index} className="p-4 rounded-lg bg-secondary/30 border border-border/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{cmd.title}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(cmd.command, index)}
                        >
                          {copiedIndex === index ? (
                            <Check className="w-4 h-4 text-success" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <pre className="p-2 rounded bg-background/80 text-xs font-mono">
                        {cmd.command}
                      </pre>
                    </div>
                  ))}
                </div>

                {/* Features */}
                <div className="p-4 rounded-lg bg-secondary/30">
                  <h4 className="font-medium mb-3">Key Features</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <ChevronRight className="w-4 h-4 text-primary" />
                      100+ built-in technical indicators
                    </li>
                    <li className="flex items-center gap-2">
                      <ChevronRight className="w-4 h-4 text-primary" />
                      Multi-timeframe analysis
                    </li>
                    <li className="flex items-center gap-2">
                      <ChevronRight className="w-4 h-4 text-primary" />
                      Portfolio optimization tools
                    </li>
                    <li className="flex items-center gap-2">
                      <ChevronRight className="w-4 h-4 text-primary" />
                      Matplotlib plotting integration
                    </li>
                    <li className="flex items-center gap-2">
                      <ChevronRight className="w-4 h-4 text-primary" />
                      Signal submission to central dashboard
                    </li>
                  </ul>
                </div>

                <Button variant="outline" className="w-full" asChild>
                  <a href="https://github.com/mementum/backtrader" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Documentation on GitHub
                  </a>
                </Button>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="strategy">
            <ScrollArea className="h-[55vh] pr-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    Mean Reversion Strategy with Signal Submission
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(STRATEGY_TEMPLATE)}
                  >
                    {copiedStrategy ? (
                      <>
                        <Check className="w-4 h-4 mr-2 text-success" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy All
                      </>
                    )}
                  </Button>
                </div>

                <pre className="p-4 rounded-lg bg-background/80 text-xs font-mono overflow-x-auto whitespace-pre-wrap border border-border/50">
                  {STRATEGY_TEMPLATE}
                </pre>

                <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                  <div className="flex items-start gap-3">
                    <PlayCircle className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">Run the Strategy</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Save as <code className="px-1 py-0.5 rounded bg-secondary">mean_revert.py</code> and run with <code className="px-1 py-0.5 rounded bg-secondary">python mean_revert.py</code>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
