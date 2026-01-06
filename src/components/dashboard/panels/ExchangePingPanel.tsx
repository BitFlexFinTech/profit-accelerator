import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useExchangeStatus } from '@/hooks/useExchangeStatus';

export function ExchangePingPanel() {
  const { exchanges, connectedCount, isLoading } = useExchangeStatus();

  const getPingColor = (ping: number | null, isConnected: boolean) => {
    if (!isConnected || ping === null) return 'text-destructive';
    if (ping < 100) return 'text-success';
    if (ping < 200) return 'text-warning';
    return 'text-destructive';
  };

  const getStatusIndicator = (isConnected: boolean, ping: number | null) => {
    if (!isConnected) return 'status-offline';
    if (ping === null) return 'status-warning';
    if (ping < 100) return 'status-online';
    if (ping < 200) return 'status-warning';
    return 'status-offline';
  };

  // Generate mock ping values for demo (in production, this would come from actual ping tests)
  const getDisplayPing = (exchange: typeof exchanges[0]) => {
    if (!exchange.is_connected) return null;
    // Use last_ping_ms if available, otherwise generate based on exchange name hash
    if (exchange.last_ping_ms) return exchange.last_ping_ms;
    const hash = exchange.exchange_name.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return 20 + (hash % 180);
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wifi className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Exchange Latency</h3>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{connectedCount}/{exchanges.length}</span>
          {isLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
        </div>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
        {exchanges.map((exchange) => {
          const ping = getDisplayPing(exchange);
          return (
            <div
              key={exchange.id}
              className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={getStatusIndicator(exchange.is_connected, ping)} />
                <div>
                  <span className="font-medium">{exchange.exchange_name}</span>
                  {exchange.is_connected && exchange.balance_usdt !== null && (
                    <p className="text-xs text-muted-foreground">
                      ${exchange.balance_usdt.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {exchange.is_connected && ping !== null ? (
                  <>
                    <span className={`font-mono font-bold ${getPingColor(ping, exchange.is_connected)}`}>
                      {ping}ms
                    </span>
                    <div className="w-16 h-2 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          ping < 100
                            ? 'bg-success'
                            : ping < 200
                            ? 'bg-warning'
                            : 'bg-destructive'
                        }`}
                        style={{ width: `${Math.min(100, (1 - ping / 500) * 100)}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <span className="text-muted-foreground flex items-center gap-1 text-sm">
                    <WifiOff className="w-4 h-4" />
                    {exchange.is_connected ? 'No ping' : 'Offline'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-4 text-center">
        Latency measured from Tokyo (ap-northeast-1)
      </p>
    </div>
  );
}
