import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Wifi, RefreshCw, Plus, Trash2, TestTube, Clock, DollarSign, AlertCircle, Edit, Server, Circle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExchangeStatus, ExchangeConnection } from '@/hooks/useExchangeStatus';
import { useVpsStatusLite } from '@/hooks/useVpsStatusLite';
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
import { pingVpsExchanges, type ExchangePing } from '@/services/vpsApiService';
import { StatusDot } from '@/components/ui/StatusDot';

interface TestResult {
  exchange: string;
  success: boolean;
  balance?: string;
  pingMs?: number;
  error?: string;
}

// Memoized exchange row to prevent unnecessary re-renders
const ExchangeRow = memo(function ExchangeRow({
  exchange,
  now,
  testResult,
  testingExchange,
  disconnectingExchange,
  vpsPing,
  onTest,
  onAddEdit,
  onConfirmDisconnect,
  formatBalance,
  formatLastSync,
  isBalanceFresh,
  getSecondsAgo,
  getStatusColor,
}: {
  exchange: ExchangeConnection;
  now: number;
  testResult?: TestResult;
  testingExchange: string | null;
  disconnectingExchange: string | null;
  vpsPing?: ExchangePing;
  onTest: (exchange: ExchangeConnection) => void;
  onAddEdit: (exchange: ExchangeConnection) => void;
  onConfirmDisconnect: (name: string) => void;
  formatBalance: (balance: number | null) => string;
  formatLastSync: (timestamp: string | null) => string;
  isBalanceFresh: (timestamp: string | null) => boolean;
  getSecondsAgo: (timestamp: string | null) => number | null;
  getStatusColor: (exchange: ExchangeConnection) => string;
}) {
  const isFresh = isBalanceFresh(exchange.balance_updated_at);
  const secsAgo = getSecondsAgo(exchange.balance_updated_at);
  const statusColor = getStatusColor(exchange);

  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
    >
      <div className="flex items-center gap-3">
        {/* Status dot with pulse for fresh data */}
        <StatusDot 
          color={exchange.is_connected ? 'success' : 'muted'} 
          pulse={exchange.is_connected && isFresh} 
          size="sm" 
        />
        
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
            {exchange.is_connected && isFresh && (
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
            <span className={`flex items-center gap-1 ${isFresh ? 'text-success' : ''}`}>
              <Clock className="w-3 h-3" />
              {secsAgo === null ? '—' : secsAgo < 60 ? `${secsAgo}s ago` : formatLastSync(exchange.balance_updated_at)}
            </span>
            {exchange.last_ping_ms && (
              <span className="text-success">{exchange.last_ping_ms}ms</span>
            )}
            {vpsPing && (
              <span className={`flex items-center gap-1 ${vpsPing.success ? 'text-amber-400' : 'text-destructive'}`}>
                <Zap className="w-3 h-3" />
                VPS: {vpsPing.success ? `${vpsPing.latencyMs}ms` : 'err'}
              </span>
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
          onClick={() => onTest(exchange)}
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
          onClick={() => onAddEdit(exchange)}
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
            onClick={() => onConfirmDisconnect(exchange.exchange_name)}
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
  );
});

export function ExchangeConnectionsCard() {
  const { exchanges, connectedCount, totalBalance, isLoading } = useExchangeStatus();
  // Use lightweight VPS hook that doesn't subscribe to vps_metrics
  const { isActive: isVpsActive, ip: vpsIp } = useVpsStatusLite();
  const [testingExchange, setTestingExchange] = useState<string | null>(null);
  const [disconnectingExchange, setDisconnectingExchange] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const [showExchangeWizard, setShowExchangeWizard] = useState(false);
  const [wizardExchangeId, setWizardExchangeId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [vpsPingResults, setVpsPingResults] = useState<Record<string, ExchangePing>>({});
  const [isVpsPinging, setIsVpsPinging] = useState(false);
  
  // Update "now" every 60 seconds to minimize rerenders (was 10s)
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Stable helper to check if balance is fresh (updated within 10 seconds)
  const isBalanceFresh = useCallback((timestamp: string | null) => {
    if (!timestamp) return false;
    try {
      return differenceInSeconds(now, new Date(timestamp)) < 10;
    } catch {
      return false;
    }
  }, [now]);

  // Stable helper to get seconds ago
  const getSecondsAgo = useCallback((timestamp: string | null) => {
    if (!timestamp) return null;
    try {
      return differenceInSeconds(now, new Date(timestamp));
    } catch {
      return null;
    }
  }, [now]);

  const handleTestConnection = useCallback(async (exchange: ExchangeConnection) => {
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
  }, []);

  const handleDisconnect = useCallback(async (exchangeName: string) => {
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
  }, []);

  const handleSyncAll = useCallback(async () => {
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
  }, []);

  const handleVpsPing = useCallback(async () => {
    if (!vpsIp) {
      toast.error('No VPS IP available');
      return;
    }
    setIsVpsPinging(true);
    try {
      const result = await pingVpsExchanges(vpsIp);
      if (result.success) {
        const pingMap: Record<string, ExchangePing> = {};
        result.pings.forEach(p => {
          pingMap[p.exchange.toLowerCase()] = p;
        });
        setVpsPingResults(pingMap);
        toast.success(`VPS ping complete: ${result.pings.length} exchanges (${result.responseMs}ms)`);
      } else {
        toast.error(`VPS ping failed: ${result.error}`);
      }
    } catch (err) {
      toast.error('Failed to ping exchanges via VPS');
    } finally {
      setIsVpsPinging(false);
    }
  }, [vpsIp]);

  const handleAddEdit = useCallback((exchange: ExchangeConnection) => {
    setWizardExchangeId(exchange.exchange_id);
    setShowExchangeWizard(true);
  }, []);

  const handleOpenWizard = useCallback(() => {
    setWizardExchangeId(null);
    setShowExchangeWizard(true);
  }, []);

  const getStatusColor = useCallback((exchange: ExchangeConnection) => {
    const result = testResults[exchange.exchange_name];
    if (result) {
      return result.success ? 'bg-success' : 'bg-destructive';
    }
    return exchange.is_connected ? 'bg-success' : 'bg-muted-foreground/30';
  }, [testResults]);

  const formatLastSync = useCallback((timestamp: string | null) => {
    if (!timestamp) return '—';
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return '—';
    }
  }, []);

  const formatBalance = useCallback((balance: number | null) => {
    if (balance === null || balance === undefined) return '—';
    return `$${balance.toLocaleString()}`;
  }, []);

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
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-accent/20 text-green-accent cursor-help">
                    <Server className="w-3 h-3" />
                    VPS Proxy
                    {vpsIp && <span className="font-mono text-[10px] opacity-70">({vpsIp})</span>}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Balances fetched via VPS whitelisted IP for exchange API access
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {connectedCount}/11 connected • <span className="text-teal">${totalBalance.toLocaleString()}</span>
            </span>
            {isVpsActive && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleVpsPing}
                    disabled={isVpsPinging}
                    className="hover:border-amber-500/50 hover:bg-amber-500/10 transition-all duration-300"
                  >
                    {isVpsPinging ? (
                      <RefreshCw className="w-4 h-4 mr-1 text-amber-400 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4 mr-1 text-amber-400" />
                    )}
                    VPS Ping
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Test exchange latency from VPS</TooltipContent>
              </Tooltip>
            )}
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
              <ExchangeRow
                key={exchange.id}
                exchange={exchange}
                now={now}
                testResult={testResults[exchange.exchange_name]}
                testingExchange={testingExchange}
                disconnectingExchange={disconnectingExchange}
                vpsPing={vpsPingResults[exchange.exchange_name.toLowerCase()]}
                onTest={handleTestConnection}
                onAddEdit={handleAddEdit}
                onConfirmDisconnect={setConfirmDisconnect}
                formatBalance={formatBalance}
                formatLastSync={formatLastSync}
                isBalanceFresh={isBalanceFresh}
                getSecondsAgo={getSecondsAgo}
                getStatusColor={getStatusColor}
              />
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
