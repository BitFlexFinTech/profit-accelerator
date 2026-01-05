import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export function SentimentPanel() {
  const fearGreedIndex = 65; // 0-100, mock data
  const sentiment = fearGreedIndex > 55 ? 'Greed' : fearGreedIndex < 45 ? 'Fear' : 'Neutral';
  const sentimentColor = fearGreedIndex > 55 ? 'text-success' : fearGreedIndex < 45 ? 'text-destructive' : 'text-warning';

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold mb-4">Market Sentiment</h3>
      
      {/* Fear & Greed Gauge */}
      <div className="relative h-32 mb-4">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <span className={`text-4xl font-bold ${sentimentColor}`}>{fearGreedIndex}</span>
            <p className={`text-sm font-medium ${sentimentColor}`}>{sentiment}</p>
          </div>
        </div>
        
        {/* Gauge background */}
        <svg viewBox="0 0 200 100" className="w-full h-full">
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(340 100% 45%)" />
              <stop offset="50%" stopColor="hsl(45 100% 50%)" />
              <stop offset="100%" stopColor="hsl(160 100% 40%)" />
            </linearGradient>
          </defs>
          <path
            d="M 20 90 A 80 80 0 0 1 180 90"
            fill="none"
            stroke="hsl(var(--secondary))"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d="M 20 90 A 80 80 0 0 1 180 90"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${(fearGreedIndex / 100) * 251} 251`}
          />
        </svg>
      </div>

      {/* Trend Indicators */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-secondary/30 text-center">
          <TrendingUp className="w-5 h-5 mx-auto mb-1 text-success" />
          <p className="text-xs text-muted-foreground">BTC</p>
          <p className="text-sm font-medium text-success">+2.4%</p>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30 text-center">
          <TrendingDown className="w-5 h-5 mx-auto mb-1 text-destructive" />
          <p className="text-xs text-muted-foreground">ETH</p>
          <p className="text-sm font-medium text-destructive">-1.2%</p>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30 text-center">
          <Minus className="w-5 h-5 mx-auto mb-1 text-warning" />
          <p className="text-xs text-muted-foreground">SOL</p>
          <p className="text-sm font-medium text-warning">+0.1%</p>
        </div>
      </div>
    </div>
  );
}
