import { useState } from 'react';
import { Wifi, WifiOff, RefreshCw, Plus, Trash2, TestTube, Clock, DollarSign, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExchangeStatus } from '@/hooks/useExchangeStatus';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExchangeWizard } from '../wizards/ExchangeWizard';

interface TestResult {
  exchange: string;
  success: boolean;
  balance?: string;
  pingMs?: number;
  error?: string;
}

export function ExchangeConnectionsCard() {
  const { exchanges, connectedCount, totalBalance, isLoading } = useExchangeStatus();
  const [testingExchange, setTestingExchange] = useState<string | null>(null);
  const [disconnectingExchange, setDisconnectingExchange] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const [showExchangeWizard, setShowExchangeWizard] = useState(false);

  const connectedExchanges = exchanges.filter(e => e.is_connected);

  const handleTestConnection = async (exchangeName: string) => {
    setTestingExchange(exchangeName);
    try {
      const { data, error } = await supabase.functions.invoke('trade-engine', {
        body: { action: 'test-stored-connection', exchangeName }
      });

      if (error) throw error;

      setTestResults(prev => ({
        ...prev,
        [exchangeName]: {
          exchange: exchangeName,
          success: data.success,
          balance: data.balance,
          pingMs: data.pingMs,
          error: data.error
        }
      }));

      if (data.success) {
        toast.success(`${exchangeName}: Connected (${data.pingMs}ms, $${data.balance})`);
      } else {
        toast.error(`${exchangeName}: ${data.error || 'Connection failed'}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Test failed';
      toast.error(`${exchangeName}: ${errorMsg}`);
      setTestResults(prev => ({
        ...prev,
        [exchangeName]: { exchange: exchangeName, success: false, error: errorMsg }
      }));
    } finally {
      setTestingExchange(null);
    }
  };

  const handleDisconnect = async (exchangeName: string) => {
    setDisconnectingExchange(exchangeName);
    try {
      const { data, error } = await supabase.functions.invoke('trade-engine', {
        body: { action: 'disconnect-exchange', exchangeName }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(`${exchangeName} disconnected`);
        setTestResults(prev => {
          const newResults = { ...prev };
          delete newResults[exchangeName];
          return newResults;
        });
      } else {
        toast.error(data.error || 'Disconnect failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setDisconnectingExchange(null);
      setConfirmDisconnect(null);
    }
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('poll-balances');
      
      if (error) throw error;
      
      if (data?.success) {
        toast.success('All balances synced');
      } else {
        toast.error(data?.error || 'Sync failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusColor = (exchange: typeof exchanges[0]) => {
    const result = testResults[exchange.exchange_name];
    if (result) {
      return result.success ? 'bg-success' : 'bg-destructive';
    }
    return exchange.is_connected ? 'bg-success' : 'bg-muted';
  };

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  return (
    <>
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wifi className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Exchange Connections</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {connectedCount} connected • ${totalBalance.toLocaleString()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExchangeWizard(true)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncAll}
              disabled={isSyncing || connectedCount === 0}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync
            </Button>
          </div>
        </div>

        {connectedExchanges.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <WifiOff className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground mb-2">No exchanges connected</p>
            <p className="text-sm text-muted-foreground/70 mb-4">
              Connect an exchange to start trading
            </p>
            <Button variant="outline" size="sm" onClick={() => setShowExchangeWizard(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Exchange
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {connectedExchanges.map((exchange) => (
              <div
                key={exchange.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(exchange)}`} />
                  <div>
                    <span className="font-medium capitalize">{exchange.exchange_name}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        {exchange.balance_usdt?.toLocaleString() ?? '0'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatLastSync(exchange.balance_updated_at)}
                      </span>
                      {exchange.last_ping_ms && (
                        <span className="text-success">{exchange.last_ping_ms}ms</span>
                      )}
                    </div>
                    {exchange.last_error && (
                      <div className="flex items-center gap-1 text-xs text-destructive mt-1">
                        <AlertCircle className="w-3 h-3" />
                        {exchange.last_error}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTestConnection(exchange.exchange_name)}
                    disabled={testingExchange === exchange.exchange_name}
                  >
                    {testingExchange === exchange.exchange_name ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <TestTube className="w-4 h-4" />
                    )}
                    <span className="ml-1 hidden sm:inline">Test</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDisconnect(exchange.exchange_name)}
                    disabled={disconnectingExchange === exchange.exchange_name}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    {disconnectingExchange === exchange.exchange_name ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!confirmDisconnect} onOpenChange={() => setConfirmDisconnect(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {confirmDisconnect}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the API credentials and disconnect the exchange.
              You can reconnect later by adding the exchange again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDisconnect && handleDisconnect(confirmDisconnect)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ExchangeWizard 
        open={showExchangeWizard} 
        onOpenChange={setShowExchangeWizard}
      />
    </>
  );
}