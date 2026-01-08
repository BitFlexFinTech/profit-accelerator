import { useState } from 'react';
import { Newspaper, ExternalLink, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useCryptoNews } from '@/hooks/useCryptoNews';
import { cn } from '@/lib/utils';

// Sentiment keywords for analysis
const BULLISH_KEYWORDS = ['surge', 'soar', 'rally', 'bullish', 'gain', 'jump', 'rise', 'high', 'breakthrough', 'adoption', 'institutional', 'etf approved', 'milestone', 'record'];
const BEARISH_KEYWORDS = ['crash', 'plunge', 'bearish', 'drop', 'fall', 'low', 'fear', 'sell', 'regulatory', 'ban', 'hack', 'fraud', 'collapse', 'warning'];

function analyzeSentiment(title: string): 'bullish' | 'bearish' | 'neutral' {
  const lowerTitle = title.toLowerCase();
  
  const bullishCount = BULLISH_KEYWORDS.filter(kw => lowerTitle.includes(kw)).length;
  const bearishCount = BEARISH_KEYWORDS.filter(kw => lowerTitle.includes(kw)).length;
  
  if (bullishCount > bearishCount) return 'bullish';
  if (bearishCount > bullishCount) return 'bearish';
  return 'neutral';
}

function SentimentBadge({ sentiment }: { sentiment: 'bullish' | 'bearish' | 'neutral' }) {
  const config = {
    bullish: { icon: TrendingUp, label: 'BULLISH', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
    bearish: { icon: TrendingDown, label: 'BEARISH', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
    neutral: { icon: Minus, label: 'NEUTRAL', className: 'bg-muted/50 text-muted-foreground border-muted' },
  };
  
  const { icon: Icon, label, className } = config[sentiment];
  
  return (
    <Badge variant="outline" className={cn('text-[8px] px-1 py-0 h-4 gap-0.5', className)}>
      <Icon className="w-2 h-2" />
      {label}
    </Badge>
  );
}

export function NewsPanel() {
  const { news, isLoading, lastUpdate, refetch } = useCryptoNews(300000); // 5 min refresh
  const [selectedArticle, setSelectedArticle] = useState<{ title: string; url: string } | null>(null);

  return (
    <div className="glass-card h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-border/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Crypto News</h3>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-[9px] text-muted-foreground">
              {formatDistanceToNow(lastUpdate, { addSuffix: true })}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="h-5 w-5 p-0"
          >
            <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* News List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-1">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-3 bg-muted rounded w-3/4 mb-1" />
                  <div className="h-2 bg-muted/50 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : news.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No news available
            </div>
          ) : (
            news.map((item) => {
              const sentiment = analyzeSentiment(item.title);
              
              return (
                <Sheet key={item.id}>
                  <SheetTrigger asChild>
                    <button
                      className="w-full text-left p-2 rounded-lg hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0"
                      onClick={() => setSelectedArticle({ title: item.title, url: item.url })}
                    >
                      <div className="flex items-start gap-2">
                        {/* Thumbnail Image */}
                        {item.imageUrl && (
                          <img 
                            src={item.imageUrl} 
                            alt=""
                            className="w-10 h-10 rounded object-cover flex-shrink-0"
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                        )}
                        <SentimentBadge sentiment={sentiment} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium leading-tight line-clamp-2">
                            {item.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-muted-foreground">
                              {item.source}
                            </span>
                            <span className="text-[9px] text-muted-foreground">
                              • {formatDistanceToNow(item.pubDate, { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                        <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                      </div>
                    </button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-full sm:w-[600px] sm:max-w-[80vw] p-0">
                    <SheetHeader className="p-4 border-b border-border">
                      <div className="flex items-start gap-2">
                        <SentimentBadge sentiment={sentiment} />
                        <SheetTitle className="text-left text-sm leading-tight">
                          {item.title}
                        </SheetTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{item.source}</span>
                        <span className="text-xs text-muted-foreground">
                          • {formatDistanceToNow(item.pubDate, { addSuffix: true })}
                        </span>
                        <a 
                          href={item.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="ml-auto text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          Open in new tab <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </SheetHeader>
                    <div className="flex-1 h-[calc(100vh-120px)]">
                      <iframe
                        src={item.url}
                        className="w-full h-full border-0"
                        title={item.title}
                        sandbox="allow-scripts allow-same-origin"
                      />
                    </div>
                  </SheetContent>
                </Sheet>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}