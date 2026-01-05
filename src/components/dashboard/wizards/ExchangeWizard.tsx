import { useState } from 'react';
import { Wallet, Check, Loader2, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ExchangeWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const exchanges = [
  { id: 'bybit', name: 'Bybit', color: '#f7a600' },
  { id: 'okx', name: 'OKX', color: '#ffffff' },
  { id: 'bitget', name: 'Bitget', color: '#00d9a5' },
  { id: 'bingx', name: 'BingX', color: '#2b63f6' },
  { id: 'mexc', name: 'MEXC', color: '#00b897' },
  { id: 'gateio', name: 'Gate.io', color: '#17e5a2' },
  { id: 'binance', name: 'Binance', color: '#f3ba2f' },
];

export function ExchangeWizard({ open, onOpenChange }: ExchangeWizardProps) {
  const [selectedExchange, setSelectedExchange] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [connectedExchanges, setConnectedExchanges] = useState<string[]>(['bybit', 'okx']);

  const handleTest = async () => {
    setIsLoading(true);
    setTestResult(null);
    
    // Simulate API test
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Mock result
    setTestResult(Math.random() > 0.3 ? 'success' : 'error');
    setIsLoading(false);
  };

  const handleSave = () => {
    if (selectedExchange && testResult === 'success') {
      setConnectedExchanges([...connectedExchanges, selectedExchange]);
      setSelectedExchange(null);
      setApiKey('');
      setApiSecret('');
      setTestResult(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-accent" />
            </div>
            <div>
              <DialogTitle>Exchange Connections</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Connect your exchange APIs for trading
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          {!selectedExchange ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in">
              {exchanges.map((exchange) => {
                const isConnected = connectedExchanges.includes(exchange.id);
                return (
                  <button
                    key={exchange.id}
                    onClick={() => !isConnected && setSelectedExchange(exchange.id)}
                    disabled={isConnected}
                    className={`p-4 rounded-xl border text-center transition-all ${
                      isConnected
                        ? 'bg-success/10 border-success/30'
                        : 'bg-secondary/30 border-border hover:border-primary/50 hover:bg-secondary/50'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-lg mx-auto mb-2 flex items-center justify-center"
                      style={{ backgroundColor: `${exchange.color}20` }}
                    >
                      <span className="font-bold text-sm" style={{ color: exchange.color }}>
                        {exchange.name.slice(0, 2)}
                      </span>
                    </div>
                    <p className="font-medium text-sm">{exchange.name}</p>
                    {isConnected && (
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <Check className="w-3 h-3 text-success" />
                        <span className="text-xs text-success">Connected</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/30">
                <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                  <span className="font-bold text-accent">
                    {exchanges.find(e => e.id === selectedExchange)?.name.slice(0, 2)}
                  </span>
                </div>
                <div>
                  <p className="font-medium">
                    {exchanges.find(e => e.id === selectedExchange)?.name}
                  </p>
                  <p className="text-sm text-muted-foreground">Enter API credentials</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">API Key</label>
                <Input
                  type="password"
                  placeholder="Enter your API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="font-mono bg-secondary/50"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">API Secret</label>
                <Input
                  type="password"
                  placeholder="Enter your API secret"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  className="font-mono bg-secondary/50"
                />
              </div>

              {testResult && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${
                  testResult === 'success' 
                    ? 'bg-success/20 text-success' 
                    : 'bg-destructive/20 text-destructive'
                }`}>
                  {testResult === 'success' ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span className="text-sm">Connection successful! Balance: $5,234.56</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm">Connection failed. Please check your credentials.</span>
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setSelectedExchange(null)}>
                  ← Back
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTest}
                  disabled={!apiKey || !apiSecret || isLoading}
                  className="flex-1"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={testResult !== 'success'}
                  className="flex-1"
                >
                  Save & Connect
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
