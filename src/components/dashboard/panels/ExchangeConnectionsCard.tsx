import { useState, useEffect, useMemo, useCallback } from 'react';
import { Wifi, RefreshCw, Plus, Trash2, TestTube, Clock, DollarSign, AlertCircle, Edit, Server, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExchangeStatus, ExchangeConnection } from '@/hooks/useExchangeStatus';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow, differenceInSeconds } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  const { vps } = useSystemStatus();
  const [testingExchange, setTestingExchange] = useState<string | null>(null);
  const [disconnectingExchange, setDisconnectingExchange] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const [showExchangeWizard, setShowExchangeWizard] = useState(false);
  const [wizardExchangeId, setWizardExchangeId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  
  // Update "now" every 10 seconds instead of every second to prevent glitching
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);
  
  const isVpsActive = vps.status === 'running' || (vps.status === 'idle' && vps.ip);

  // Helper to check if balance is fresh (updated within 10 seconds)
  const isBalanceFresh = (timestamp: string | null) => {
    if (!timestamp) return false;
    try {
      return differenceInSeconds(now, new Date(timestamp)) < 10;
    } catch {
      return false;
    }
  };

  // Helper to get seconds ago
  const getSecondsAgo = (timestamp: string | null) => {
    if (!timestamp) return null;
    try {
      return differenceInSeconds(now, new Date(timestamp));
    } catch {
      return null;
    }
  };

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
    <TooltipProvider delayDuration={200}>
      <div className="glass-card card-teal p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="icon-container-teal p-1.5 rounded-md">
              <Wifi className="w-5 h-5 text-teal" />
            </div>
            <h3 className="text-lg font-semibold">Exchange Connections</h3>
            {isVpsActive && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-accent/20 text-green-accent">
                <Server className="w-3 h-3" />
                VPS Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {connectedCount}/11 connected • <span className="text-teal">${totalBalance.toLocaleString()}</span>
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenWizard}
                  className="hover:border-teal/50 hover:bg-teal/10 transition-all duration-300"
                >
                  <Plus className="w-4 h-4 mr-1 text-teal" />
                  Add
                </Button>
              </TooltipTrigger>
              <TooltipContent>Connect a new cryptocurrency exchange</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSyncAll}
                  disabled={isSyncing || connectedCount === 0}
                  className="hover:border-cyan/50 hover:bg-cyan/10 transition-all duration-300"
                >
                  <RefreshCw className={`w-4 h-4 mr-1 text-cyan ${isSyncing ? 'animate-spin' : ''}`} />
                  Refresh All
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sync all exchange balances and prices</TooltipContent>
            </Tooltip>
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
                  {/* Status dot with pulse for fresh data */}
                  <div className="relative">
                    <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(exchange)}`} />
                    {exchange.is_connected && isBalanceFresh(exchange.balance_updated_at) && (
                      <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-success animate-ping opacity-75" />
                    )}
                  </div>
                  
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
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{exchange.exchange_name}</span>
                      {exchange.is_connected && isBalanceFresh(exchange.balance_updated_at) && (
                        <span className="flex items-center gap-0.5 text-[10px] text-success bg-success/10 px-1 py-0.5 rounded">
                          <Circle className="w-1.5 h-1.5 fill-current" />
                          LIVE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        {formatBalance(exchange.balance_usdt)}
                      </span>
                      <span className={`flex items-center gap-1 ${isBalanceFresh(exchange.balance_updated_at) ? 'text-success' : ''}`}>
                        <Clock className="w-3 h-3" />
                        {(() => {
                          const secs = getSecondsAgo(exchange.balance_updated_at);
                          if (secs === null) return '—';
                          if (secs < 60) return `${secs}s ago`;
                          return formatLastSync(exchange.balance_updated_at);
                        })()}
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
    </TooltipProvider>
  );
}
