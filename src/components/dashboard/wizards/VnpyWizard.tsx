import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, Terminal, FileCode, Globe, Server, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface VnpyWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VnpyWizard({ isOpen, onClose }: VnpyWizardProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const dockerInstall = `# Install vnpy via Docker
docker pull vnpy/vnpy:latest

# Run vnpy container with persistent data
docker run -d \\
  --name vnpy \\
  -p 8888:8888 \\
  -v ~/vnpy_data:/root/.vntrader \\
  vnpy/vnpy:latest

# Start Jupyter for strategy development
docker exec -it vnpy jupyter notebook --ip=0.0.0.0 --allow-root --no-browser`;

  const pipInstall = `# Install vnpy via pip (Python 3.10+)
pip install vnpy

# Install exchange gateways
pip install vnpy_binance vnpy_okx vnpy_bybit

# Install CTA strategy module
pip install vnpy_ctastrategy vnpy_ctabacktester

# Install spread trading (optional)
pip install vnpy_spreadtrading

# Start vnpy trader
python -c "from vnpy.trader.ui import MainWindow; from vnpy.event import EventEngine; from vnpy.trader.engine import MainEngine; import sys; from PyQt5.QtWidgets import QApplication; app = QApplication(sys.argv); event_engine = EventEngine(); main_engine = MainEngine(event_engine); main_window = MainWindow(main_engine, event_engine); main_window.showMaximized(); sys.exit(app.exec_())"`;

  const strategyTemplate = `from vnpy_ctastrategy import CtaTemplate, StopOrder
from vnpy.trader.constant import Interval

class ScalpingStrategy(CtaTemplate):
    """
    High-frequency scalping strategy using MA crossover.
    Designed for 1-minute timeframe with quick entries/exits.
    """
    
    author = "HFT Bot"
    
    # Strategy parameters
    fast_window = 5
    slow_window = 20
    fixed_size = 1
    
    # Strategy variables
    fast_ma0 = 0.0
    fast_ma1 = 0.0
    slow_ma0 = 0.0
    slow_ma1 = 0.0
    
    parameters = ["fast_window", "slow_window", "fixed_size"]
    variables = ["fast_ma0", "fast_ma1", "slow_ma0", "slow_ma1"]

    def on_init(self):
        """Called when strategy is initialized."""
        self.write_log("Strategy initialization started")
        self.load_bar(10)  # Load 10 bars for warmup

    def on_start(self):
        """Called when strategy is started."""
        self.write_log("Strategy started")
        self.put_event()

    def on_stop(self):
        """Called when strategy is stopped."""
        self.write_log("Strategy stopped")
        self.put_event()

    def on_bar(self, bar):
        """Called on each new bar."""
        am = self.am  # ArrayManager for technical indicators
        am.update_bar(bar)
        
        if not am.inited:
            return

        # Calculate moving averages
        fast_ma = am.sma(self.fast_window, array=True)
        slow_ma = am.sma(self.slow_window, array=True)
        
        self.fast_ma0 = fast_ma[-1]
        self.fast_ma1 = fast_ma[-2]
        self.slow_ma0 = slow_ma[-1]
        self.slow_ma1 = slow_ma[-2]

        # Check for crossover signals
        cross_over = self.fast_ma0 > self.slow_ma0 and self.fast_ma1 <= self.slow_ma1
        cross_below = self.fast_ma0 < self.slow_ma0 and self.fast_ma1 >= self.slow_ma1

        if self.pos == 0:
            if cross_over:
                self.buy(bar.close_price, self.fixed_size)
            elif cross_below:
                self.short(bar.close_price, self.fixed_size)
        elif self.pos > 0:
            if cross_below:
                self.sell(bar.close_price, abs(self.pos))
                self.short(bar.close_price, self.fixed_size)
        elif self.pos < 0:
            if cross_over:
                self.cover(bar.close_price, abs(self.pos))
                self.buy(bar.close_price, self.fixed_size)

        self.put_event()

    def on_order(self, order):
        """Called when order status changes."""
        pass

    def on_trade(self, trade):
        """Called when trade is executed."""
        self.write_log(f"Trade: {trade.direction} {trade.volume} @ {trade.price}")
        self.put_event()

    def on_stop_order(self, stop_order: StopOrder):
        """Called when stop order is triggered."""
        pass`;

  const exchangeConfig = `# Exchange gateway configuration (gateway_setting.json)
{
    "binance": {
        "key": "YOUR_API_KEY",
        "secret": "YOUR_API_SECRET",
        "session_number": 3,
        "proxy_host": "",
        "proxy_port": 0
    },
    "okx": {
        "key": "YOUR_API_KEY",
        "secret": "YOUR_API_SECRET",
        "passphrase": "YOUR_PASSPHRASE",
        "server": "REAL"
    },
    "bybit": {
        "key": "YOUR_API_KEY",
        "secret": "YOUR_API_SECRET",
        "server": "REAL"
    }
}

# CTA strategy settings (cta_strategy_setting.json)
{
    "ScalpingStrategy.BTCUSDT.binance": {
        "class_name": "ScalpingStrategy",
        "vt_symbol": "BTCUSDT.binance",
        "setting": {
            "fast_window": 5,
            "slow_window": 20,
            "fixed_size": 0.001
        }
    }
}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <span className="text-xl">vnpy Setup Wizard</span>
              <p className="text-sm text-muted-foreground font-normal mt-1">
                Event-driven Python trading framework
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Features */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
              <Terminal className="w-5 h-5 text-purple-400 mb-2" />
              <p className="text-sm font-medium">Event-Driven</p>
              <p className="text-xs text-muted-foreground">Real-time processing</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <Globe className="w-5 h-5 text-blue-400 mb-2" />
              <p className="text-sm font-medium">30+ Gateways</p>
              <p className="text-xs text-muted-foreground">Global exchanges</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <FileCode className="w-5 h-5 text-emerald-400 mb-2" />
              <p className="text-sm font-medium">CTA Strategies</p>
              <p className="text-xs text-muted-foreground">Built-in framework</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <Server className="w-5 h-5 text-amber-400 mb-2" />
              <p className="text-sm font-medium">GUI + CLI</p>
              <p className="text-xs text-muted-foreground">Desktop & server</p>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="docker" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="docker">Docker</TabsTrigger>
              <TabsTrigger value="pip">Pip Install</TabsTrigger>
              <TabsTrigger value="strategy">Strategy</TabsTrigger>
              <TabsTrigger value="config">Config</TabsTrigger>
            </TabsList>

            <TabsContent value="docker" className="space-y-4">
              <div className="relative">
                <pre className="p-4 rounded-lg bg-secondary/50 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {dockerInstall}
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(dockerInstall, 'docker')}
                >
                  {copiedCode === 'docker' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                <p className="text-sm font-medium text-blue-400 mb-2">🐳 Docker Advantages</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Isolated environment with all dependencies</li>
                  <li>• Jupyter notebook for strategy development</li>
                  <li>• Persistent data volume for settings</li>
                  <li>• Easy to update and rollback</li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="pip" className="space-y-4">
              <div className="relative">
                <pre className="p-4 rounded-lg bg-secondary/50 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {pipInstall}
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(pipInstall, 'pip')}
                >
                  {copiedCode === 'pip' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <p className="text-sm font-medium text-amber-400 mb-2">⚠️ Requirements</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Python 3.10 or higher</li>
                  <li>• PyQt5 for GUI (optional for headless)</li>
                  <li>• TA-Lib for technical indicators</li>
                  <li>• 2GB+ RAM recommended</li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="strategy" className="space-y-4">
              <div className="relative">
                <pre className="p-4 rounded-lg bg-secondary/50 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-[400px]">
                  {strategyTemplate}
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(strategyTemplate, 'strategy')}
                >
                  {copiedCode === 'strategy' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <p className="text-sm font-medium text-emerald-400 mb-2">📈 Strategy Features</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• MA crossover for entry/exit signals</li>
                  <li>• Position reversal on opposite signal</li>
                  <li>• Event-driven architecture</li>
                  <li>• Automatic ArrayManager for indicators</li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="config" className="space-y-4">
              <div className="relative">
                <pre className="p-4 rounded-lg bg-secondary/50 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-[400px]">
                  {exchangeConfig}
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(exchangeConfig, 'config')}
                >
                  {copiedCode === 'config' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              
              <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30">
                <p className="text-sm font-medium text-rose-400 mb-2">🔐 Security Notes</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Store config files with restricted permissions</li>
                  <li>• Use environment variables for API keys</li>
                  <li>• Enable IP whitelisting on exchanges</li>
                  <li>• Disable withdrawal permissions</li>
                </ul>
              </div>
            </TabsContent>
          </Tabs>

          {/* Links */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-4 text-xs">
              <a 
                href="https://github.com/vnpy/vnpy" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline"
              >
                GitHub Repository
              </a>
              <a 
                href="https://www.vnpy.com/docs/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                Documentation
              </a>
            </div>
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
