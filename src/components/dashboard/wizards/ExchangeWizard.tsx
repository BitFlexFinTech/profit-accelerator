import { useState, useEffect } from 'react';
import { Wallet, Check, Loader2, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExchangeWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Exchange {
  id: string;
  name: string;
  color: string;
  needsPassphrase?: boolean;
  isHyperliquid?: boolean;
}

const exchanges: Exchange[] = [
  { id: 'bybit', name: 'Bybit', color: '#f7a600' },
  { id: 'okx', name: 'OKX', color: '#ffffff' },
  { id: 'bitget', name: 'Bitget', color: '#00d9a5' },
  { id: 'bingx', name: 'BingX', color: '#2b63f6' },
  { id: 'mexc', name: 'MEXC', color: '#00b897' },
  { id: 'gateio', name: 'Gate.io', color: '#17e5a2' },
  { id: 'binance', name: 'Binance', color: '#f3ba2f' },
  { id: 'kucoin', name: 'KuCoin', color: '#23af91', needsPassphrase: true },
  { id: 'kraken', name: 'Kraken', color: '#5741d9' },
  { id: 'nexo', name: 'Nexo', color: '#1a4bff' },
  { id: 'hyperliquid', name: 'Hyperliquid', color: '#00ff88', isHyperliquid: true },
];

export function ExchangeWizard({ open, onOpenChange }: ExchangeWizardProps) {
  const [selectedExchange, setSelectedExchange] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [apiPassphrase, setApiPassphrase] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [agentPrivateKey, setAgentPrivateKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; balance?: string; error?: string } | null>(null);
  const [connectedExchanges, setConnectedExchanges] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      fetchConnectedExchanges();
    }
  }, [open]);

  const fetchConnectedExchanges = async () => {
    const { data } = await supabase
      .from('exchange_connections')
      .select('exchange_name')
      .eq('is_connected', true);

    if (data) {
      setConnectedExchanges(data.map(e => e.exchange_name.toLowerCase()));
    }
  };

  const selectedExchangeData = exchanges.find(e => e.id === selectedExchange);

  const handleTest = async () => {
    if (!selectedExchange) return;
    
    setIsLoading(true);
    setTestResult(null);
    
    try {
      const response = await supabase.functions.invoke('trade-engine', {
        body: {
          action: 'test-connection',
          exchangeName: selectedExchangeData?.name || selectedExchange,
          apiKey,
          apiSecret,
          apiPassphrase: selectedExchangeData?.needsPassphrase ? apiPassphrase : undefined,
          walletAddress: selectedExchangeData?.isHyperliquid ? walletAddress : undefined,
          agentPrivateKey: selectedExchangeData?.isHyperliquid ? agentPrivateKey : undefined
        }
      });

      if (response.data?.success) {
        setTestResult({ success: true, balance: response.data.balance });
      } else {
        setTestResult({ success: false, error: response.data?.error || 'Connection failed' });
      }
    } catch (error) {
      setTestResult({ success: false, error: 'Failed to test connection' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedExchange || !testResult?.success) return;

    setIsLoading(true);
    try {
      const response = await supabase.functions.invoke('trade-engine', {
        body: {
          action: 'save-exchange',
          exchangeName: selectedExchangeData?.name || selectedExchange,
          apiKey: selectedExchangeData?.isHyperliquid ? undefined : apiKey,
          apiSecret: selectedExchangeData?.isHyperliquid ? undefined : apiSecret,
          apiPassphrase: selectedExchangeData?.needsPassphrase ? apiPassphrase : undefined,
          walletAddress: selectedExchangeData?.isHyperliquid ? walletAddress : undefined,
          agentPrivateKey: selectedExchangeData?.isHyperliquid ? agentPrivateKey : undefined,
          balance: testResult.balance
        }
      });

      if (response.data?.success) {
        toast.success(`${selectedExchangeData?.name} connected successfully!`);
        setConnectedExchanges([...connectedExchanges, selectedExchange]);
        resetForm();
      } else {
        toast.error('Failed to save exchange connection');
      }
    } catch (error) {
      toast.error('Failed to save exchange connection');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedExchange(null);
    setApiKey('');
    setApiSecret('');
    setApiPassphrase('');
    setWalletAddress('');
    setAgentPrivateKey('');
    setTestResult(null);
  };

  const isFormValid = () => {
    if (selectedExchangeData?.isHyperliquid) {
      return walletAddress.length > 10 && agentPrivateKey.length > 10;
    }
    if (selectedExchangeData?.needsPassphrase) {
      return apiKey.length > 5 && apiSecret.length > 5 && apiPassphrase.length > 3;
    }
    return apiKey.length > 5 && apiSecret.length > 5;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-accent" />
            </div>
            <div>
              <DialogTitle>Exchange Connections</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Connect all 11 exchanges for HFT trading
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
                    {exchange.needsPassphrase && !isConnected && (
                      <span className="text-xs text-warning">+ Passphrase</span>
                    )}
                    {exchange.isHyperliquid && !isConnected && (
                      <span className="text-xs text-accent">Wallet Auth</span>
                    )}
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
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${selectedExchangeData?.color}20` }}
                >
                  <span className="font-bold" style={{ color: selectedExchangeData?.color }}>
                    {selectedExchangeData?.name.slice(0, 2)}
                  </span>
                </div>
                <div>
                  <p className="font-medium">{selectedExchangeData?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedExchangeData?.isHyperliquid 
                      ? 'Enter wallet credentials' 
                      : 'Enter API credentials'}
                  </p>
                </div>
              </div>

              {selectedExchangeData?.isHyperliquid ? (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Account Wallet Address</label>
                    <Input
                      type="text"
                      placeholder="0x..."
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      className="font-mono bg-secondary/50"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Your Hyperliquid account wallet address
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">API Agent Private Key</label>
                    <Input
                      type="password"
                      placeholder="Enter your agent private key"
                      value={agentPrivateKey}
                      onChange={(e) => setAgentPrivateKey(e.target.value)}
                      className="font-mono bg-secondary/50"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Private key for the API agent (not your main wallet key)
                    </p>
                  </div>
                </>
              ) : (
                <>
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

                  {selectedExchangeData?.needsPassphrase && (
                    <div>
                      <label className="text-sm font-medium mb-2 block">API Passphrase</label>
                      <Input
                        type="password"
                        placeholder="Enter your API passphrase"
                        value={apiPassphrase}
                        onChange={(e) => setApiPassphrase(e.target.value)}
                        className="font-mono bg-secondary/50"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        KuCoin requires a passphrase set during API key creation
                      </p>
                    </div>
                  )}
                </>
              )}

              {testResult && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${
                  testResult.success 
                    ? 'bg-success/20 text-success' 
                    : 'bg-destructive/20 text-destructive'
                }`}>
                  {testResult.success ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span className="text-sm">Connection successful! Balance: ${testResult.balance}</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm">{testResult.error}</span>
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={resetForm}>
                  ← Back
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTest}
                  disabled={!isFormValid() || isLoading}
                  className="flex-1"
                >
                  {isLoading && !testResult ? (
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
                  disabled={!testResult?.success || isLoading}
                  className="flex-1"
                >
                  {isLoading && testResult?.success ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save & Connect'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="text-center text-xs text-muted-foreground border-t border-border pt-4">
          {connectedExchanges.length}/11 exchanges connected
        </div>
      </DialogContent>
    </Dialog>
  );
}
