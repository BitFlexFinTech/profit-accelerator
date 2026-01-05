import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

const recentTrades = [
  { symbol: 'BTC/USDT', side: 'long', pnl: 45.23, time: '2 min ago', exchange: 'Bybit' },
  { symbol: 'ETH/USDT', side: 'short', pnl: -12.50, time: '15 min ago', exchange: 'OKX' },
  { symbol: 'SOL/USDT', side: 'long', pnl: 28.75, time: '32 min ago', exchange: 'Bitget' },
  { symbol: 'BTC/USDT', side: 'long', pnl: 67.00, time: '1 hr ago', exchange: 'Bybit' },
  { symbol: 'DOGE/USDT', side: 'short', pnl: 15.30, time: '2 hrs ago', exchange: 'BingX' },
];

export function RecentTradesPanel() {
  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold mb-4">Recent Trades</h3>
      
      <div className="space-y-3">
        {recentTrades.map((trade, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                trade.side === 'long' ? 'bg-success/20' : 'bg-destructive/20'
              }`}>
                {trade.side === 'long' ? (
                  <ArrowUpRight className="w-4 h-4 text-success" />
                ) : (
                  <ArrowDownRight className="w-4 h-4 text-destructive" />
                )}
              </div>
              <div>
                <p className="font-medium">{trade.symbol}</p>
                <p className="text-xs text-muted-foreground">{trade.exchange} • {trade.time}</p>
              </div>
            </div>
            
            <span className={`font-bold ${trade.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
              {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <button className="w-full mt-4 py-2 text-sm text-primary hover:underline">
        View All Trades →
      </button>
    </div>
  );
}
