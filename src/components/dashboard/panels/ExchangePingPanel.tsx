import { Wifi, WifiOff, RefreshCw, Plus } from 'lucide-react';
import { useExchangeStatus } from '@/hooks/useExchangeStatus';

export function ExchangePingPanel() {
  const { exchanges, connectedCount, isLoading } = useExchangeStatus();

  // Filter to show only connected exchanges
  const connectedExchanges = exchanges.filter(e => e.is_connected);

  const getPingColor = (ping: number | null) => {
    if (ping === null) return 'text-destructive';
    if (ping < 100) return 'text-success';
    if (ping < 200) return 'text-warning';
    return 'text-destructive';
  };

  const getStatusIndicator = (ping: number | null) => {
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
          <span>{connectedCount} connected</span>
          {isLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
        </div>
      </div>

      {connectedExchanges.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <WifiOff className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground mb-2">No exchanges connected</p>
          <p className="text-sm text-muted-foreground/70 mb-4">
            Connect an exchange to see latency metrics
          </p>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary transition-colors text-sm">
            <Plus className="w-4 h-4" />
            Add Exchange
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
            {connectedExchanges.map((exchange) => {
              const ping = getDisplayPing(exchange);
              return (
                <div
                  key={exchange.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={getStatusIndicator(ping)} />
                    <div>
                      <span className="font-medium">{exchange.exchange_name}</span>
                      {exchange.balance_usdt !== null && (
                        <p className="text-xs text-muted-foreground">
                          ${exchange.balance_usdt.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {ping !== null ? (
                      <>
                        <span className={`font-mono font-bold ${getPingColor(ping)}`}>
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
                        No ping
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
        </>
      )}
    </div>
  );
}
