import { Wifi, WifiOff } from 'lucide-react';

const exchanges = [
  { name: 'Bybit', ping: 23, status: 'online' },
  { name: 'OKX', ping: 45, status: 'online' },
  { name: 'Bitget', ping: 67, status: 'online' },
  { name: 'BingX', ping: 89, status: 'online' },
  { name: 'MEXC', ping: 156, status: 'warning' },
  { name: 'Gate.io', ping: 234, status: 'warning' },
  { name: 'Binance', ping: null, status: 'offline' },
];

export function ExchangePingPanel() {
  const getPingColor = (ping: number | null) => {
    if (ping === null) return 'text-destructive';
    if (ping < 100) return 'text-success';
    if (ping < 200) return 'text-warning';
    return 'text-destructive';
  };

  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'online':
        return 'status-online';
      case 'warning':
        return 'status-warning';
      default:
        return 'status-offline';
    }
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Wifi className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Exchange Latency</h3>
      </div>

      <div className="space-y-3">
        {exchanges.map((exchange) => (
          <div
            key={exchange.name}
            className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className={getStatusIndicator(exchange.status)} />
              <span className="font-medium">{exchange.name}</span>
            </div>
            
            <div className="flex items-center gap-2">
              {exchange.ping !== null ? (
                <>
                  <span className={`font-mono font-bold ${getPingColor(exchange.ping)}`}>
                    {exchange.ping}ms
                  </span>
                  <div className={`w-16 h-2 rounded-full bg-secondary overflow-hidden`}>
                    <div
                      className={`h-full rounded-full transition-all ${
                        exchange.ping < 100
                          ? 'bg-success'
                          : exchange.ping < 200
                          ? 'bg-warning'
                          : 'bg-destructive'
                      }`}
                      style={{ width: `${Math.min(100, (1 - exchange.ping / 500) * 100)}%` }}
                    />
                  </div>
                </>
              ) : (
                <span className="text-destructive flex items-center gap-1">
                  <WifiOff className="w-4 h-4" />
                  Offline
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mt-4 text-center">
        Latency measured from Tokyo (ap-northeast-1)
      </p>
    </div>
  );
}
