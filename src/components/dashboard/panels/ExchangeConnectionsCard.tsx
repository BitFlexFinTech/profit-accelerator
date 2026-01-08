import { useState } from 'react';
import { Wifi, RefreshCw, Plus, Trash2, TestTube, Clock, DollarSign, AlertCircle, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExchangeStatus, ExchangeConnection } from '@/hooks/useExchangeStatus';
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
  const [wizardExchangeId, setWizardExchangeId] = useState<string | null>(null);

  const handleTestConnection = async (exchange: ExchangeConnection) => {
    if (!exchange.is_connected) {
      toast.error('No credentials stored for this exchange');
      return;
    }
    
    setTestingExchange(exchange.exchange_name);
    try {
      const { data, error } = await supabase.functions.invoke('trade-engine', {
        body: { action: 'test-stored-connection', exchangeName: exchange.exchange_name }
      });

      if (error) throw error;

      setTestResults(prev => ({
        ...prev,
        [exchange.exchange_name]: {
          exchange: exchange.exchange_name,
          success: data.success,
          balance: data.balance,
          pingMs: data.pingMs,
          error: data.error
        }
      }));

      if (data.success) {
        toast.success(`${exchange.exchange_name}: Connected (${data.pingMs}ms, $${data.balance})`);
      } else {
        toast.error(`${exchange.exchange_name}: ${data.error || 'Connection failed'}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Test failed';
      toast.error(`${exchange.exchange_name}: ${errorMsg}`);
      setTestResults(prev => ({
        ...prev,
        [exchange.exchange_name]: { exchange: exchange.exchange_name, success: false, error: errorMsg }
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

  const handleAddEdit = (exchange: ExchangeConnection) => {
    setWizardExchangeId(exchange.exchange_id);
    setShowExchangeWizard(true);
  };

  const handleOpenWizard = () => {
    setWizardExchangeId(null);
    setShowExchangeWizard(true);
  };

  const getStatusColor = (exchange: ExchangeConnection) => {
    const result = testResults[exchange.exchange_name];
    if (result) {
      return result.success ? 'bg-success' : 'bg-destructive';
    }
    return exchange.is_connected ? 'bg-success' : 'bg-muted-foreground/30';
  };

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return '—';
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return '—';
    }
  };

  const formatBalance = (balance: number | null) => {
    if (balance === null || balance === undefined) return '—';
    return `$${balance.toLocaleString()}`;
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
              {connectedCount}/11 connected • ${totalBalance.toLocaleString()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenWizard}
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
              Refresh All
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            {exchanges.map((exchange) => (
              <div
                key={exchange.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {/* Status dot */}
                  <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(exchange)}`} />
                  
                  {/* Exchange icon and name */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${exchange.color}20` }}
                  >
                    <span className="font-bold text-xs" style={{ color: exchange.color }}>
                      {exchange.exchange_name.slice(0, 2)}
                    </span>
                  </div>
                  
                  <div>
                    <span className="font-medium">{exchange.exchange_name}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        {formatBalance(exchange.balance_usdt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatLastSync(exchange.balance_updated_at)}
                      </span>
                      {exchange.last_ping_ms && (
                        <span className="text-success">{exchange.last_ping_ms}ms</span>
                      )}
                    </div>
                    {exchange.last_error && exchange.is_connected && (
                      <div className="flex items-center gap-1 text-xs text-destructive mt-1">
                        <AlertCircle className="w-3 h-3" />
                        {exchange.last_error}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {/* Test button - only for connected */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTestConnection(exchange)}
                    disabled={!exchange.is_connected || testingExchange === exchange.exchange_name}
                    title={exchange.is_connected ? 'Test connection' : 'Not connected'}
                  >
                    {testingExchange === exchange.exchange_name ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <TestTube className="w-4 h-4" />
                    )}
                  </Button>
                  
                  {/* Add/Edit button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAddEdit(exchange)}
                  >
                    {exchange.is_connected ? (
                      <Edit className="w-4 h-4" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    <span className="ml-1 hidden sm:inline">
                      {exchange.is_connected ? 'Edit' : 'Add'}
                    </span>
                  </Button>
                  
                  {/* Disconnect button - only for connected */}
                  {exchange.is_connected && (
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
                  )}
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
        initialExchangeId={wizardExchangeId}
      />
    </>
  );
}
