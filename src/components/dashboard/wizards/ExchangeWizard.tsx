import { useState, useEffect } from 'react';
import { Wallet, Check, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { validateExchangeAPI } from '@/lib/validators';
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
import { useRealtimeConfirmation } from '@/hooks/useRealtimeConfirmation';
import { SUPPORTED_EXCHANGES, SupportedExchange } from '@/lib/supportedExchanges';

interface ExchangeWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialExchangeId?: string | null;
}

interface IPWhitelistStatus {
  [provider: string]: boolean;
}

export function ExchangeWizard({ open, onOpenChange, initialExchangeId }: ExchangeWizardProps) {
  const [selectedExchange, setSelectedExchange] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [apiPassphrase, setApiPassphrase] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [agentPrivateKey, setAgentPrivateKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; balance?: string; error?: string } | null>(null);
  const [connectedExchanges, setConnectedExchanges] = useState<string[]>([]);
  const [ipWhitelistStatus, setIpWhitelistStatus] = useState<IPWhitelistStatus>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const selectedExchangeData = SUPPORTED_EXCHANGES.find(e => e.id === selectedExchange);

  // Realtime confirmation for optimistic UI
  const confirmation = useRealtimeConfirmation({
    table: 'exchange_connections',
    matchColumn: 'exchange_name',
    matchValue: selectedExchangeData?.name || '',
    timeoutMs: 5000,
  });

  // Handle initial exchange selection
  useEffect(() => {
    if (open && initialExchangeId) {
      setSelectedExchange(initialExchangeId);
    }
  }, [open, initialExchangeId]);

  // Auto-complete when realtime confirms
  useEffect(() => {
    if (confirmation.isConfirmed && isSaving && selectedExchange) {
      setIsSaving(false);
      toast.success(`${selectedExchangeData?.name} connected successfully!`);
      setConnectedExchanges(prev => [...prev, selectedExchange]);
      resetForm();
      onOpenChange(false);
    }
  }, [confirmation.isConfirmed, isSaving, selectedExchange, selectedExchangeData?.name]);

  useEffect(() => {
    if (open) {
      fetchConnectedExchanges();
      fetchIPWhitelistStatus();
    } else {
      // Reset when closing
      resetForm();
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

  const fetchIPWhitelistStatus = async () => {
    const { data } = await supabase
      .from('credential_permissions')
      .select('provider, ip_restricted')
      .eq('ip_restricted', true);

    if (data) {
      const statusMap: IPWhitelistStatus = {};
      data.forEach(item => {
        statusMap[item.provider.toLowerCase()] = true;
      });
      setIpWhitelistStatus(statusMap);
    }
  };

  const handleTest = async () => {
    if (!selectedExchange) return;
    
    // Validate before testing
    const errors = validateExchangeAPI({
      exchange_name: selectedExchangeData?.name,
      api_key: selectedExchangeData?.isHyperliquid ? walletAddress : apiKey,
      api_secret: selectedExchangeData?.isHyperliquid ? agentPrivateKey : apiSecret,
      api_passphrase: apiPassphrase
    });
    
    if (errors) {
      setValidationErrors(errors);
      Object.values(errors).forEach(err => toast.error(err));
      return;
    }
    
    setValidationErrors({});
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

    setIsSaving(true);
    confirmation.startWaiting(); // Start listening for realtime confirmation
    
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

      if (!response.data?.success) {
        setIsSaving(false);
        confirmation.reset();
        toast.error('Failed to save exchange connection');
      }
      // Success is handled by the realtime confirmation effect
    } catch (error) {
      setIsSaving(false);
      confirmation.reset();
      toast.error('Failed to save exchange connection');
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
    setValidationErrors({});
    confirmation.reset();
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

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="glass-card sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-accent" />
            </div>
            <div>
              <DialogTitle>
                {selectedExchange ? `Connect ${selectedExchangeData?.name}` : 'Exchange Connections'}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {selectedExchange ? 'Enter API credentials' : 'Connect all 11 exchanges for HFT trading'}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          {!selectedExchange ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in">
              {SUPPORTED_EXCHANGES.map((exchange) => {
                const isConnected = connectedExchanges.includes(exchange.id) || 
                                    connectedExchanges.includes(exchange.name.toLowerCase());
                return (
                  <button
                    key={exchange.id}
                    onClick={() => setSelectedExchange(exchange.id)}
                    className={`p-4 rounded-xl border text-center transition-all ${
                      isConnected
                        ? 'bg-success/10 border-success/30 hover:bg-success/20'
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
                      <div className="flex flex-col items-center gap-0.5 mt-1">
                        <div className="flex items-center gap-1">
                          <Check className="w-3 h-3 text-success" />
                          <span className="text-xs text-success">Connected</span>
                        </div>
                        {ipWhitelistStatus[exchange.id] && (
                          <div className="flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-primary" />
                            <span className="text-xs text-primary">IP Whitelisted</span>
                          </div>
                        )}
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
                      onChange={(e) => { setApiKey(e.target.value); setValidationErrors(prev => ({ ...prev, api_key: '' })); }}
                      className={`font-mono bg-secondary/50 ${validationErrors.api_key ? 'border-destructive' : ''}`}
                    />
                    {validationErrors.api_key && (
                      <p className="text-xs text-destructive mt-1">{validationErrors.api_key}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">API Secret</label>
                    <Input
                      type="password"
                      placeholder="Enter your API secret"
                      value={apiSecret}
                      onChange={(e) => { setApiSecret(e.target.value); setValidationErrors(prev => ({ ...prev, api_secret: '' })); }}
                      className={`font-mono bg-secondary/50 ${validationErrors.api_secret ? 'border-destructive' : ''}`}
                    />
                    {validationErrors.api_secret && (
                      <p className="text-xs text-destructive mt-1">{validationErrors.api_secret}</p>
                    )}
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
                        Passphrase set during API key creation
                      </p>
                    </div>
                  )}

                  {selectedExchange === 'binance' && (
                    <div className="p-3 rounded-lg bg-warning/20 border border-warning/30">
                      <p className="text-sm text-warning flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>
                          <strong>Important:</strong> If your Binance API key has IP restrictions, 
                          you must disable IP restrictions or whitelist the server IP.
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Create API keys with "Unrestricted" IP access for best compatibility.
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
                  disabled={!testResult?.success || isSaving}
                  className="flex-1"
                >
                  {isSaving ? (
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
      </DialogContent>
    </Dialog>
  );
}
