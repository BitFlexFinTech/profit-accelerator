import { useState } from 'react';
import { Newspaper, ExternalLink, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCryptoNews } from '@/hooks/useCryptoNews';
import { cn } from '@/lib/utils';

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
    bullish: { icon: TrendingUp, label: 'BULLISH', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    bearish: { icon: TrendingDown, label: 'BEARISH', className: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
    neutral: { icon: Minus, label: 'NEUTRAL', className: 'bg-muted/50 text-muted-foreground border-muted' },
  };
  
  const { icon: Icon, label, className } = config[sentiment];
  
  return (
    <Badge variant="outline" className={cn('text-[6px] px-0.5 py-0 h-3 gap-0.5 transition-all duration-300', className)}>
      <Icon className="w-2 h-2" />
      {label}
    </Badge>
  );
}

export function NewsPanel() {
  const { news, isLoading, lastUpdate, refetch } = useCryptoNews(300000);
  const [selectedArticle, setSelectedArticle] = useState<{ title: string; url: string } | null>(null);

  return (
    <TooltipProvider>
      <div className="card-cyan h-full flex flex-col transition-all duration-300 hover:scale-[1.005]">
        {/* Header */}
        <div className="flex items-center justify-between p-2 border-b border-cyan-400/20 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="icon-container-cyan animate-float">
              <Newspaper className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-cyan-300">Crypto News</h3>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdate && (
              <span className="text-[9px] text-muted-foreground">
                {formatDistanceToNow(lastUpdate, { addSuffix: true })}
              </span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isLoading}
                  className="h-5 w-5 p-0 hover:bg-cyan-500/20 transition-all duration-300"
                >
                  <RefreshCw className={cn("w-3 h-3 text-cyan-400", isLoading && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh crypto news feed</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* News List */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-1">
            {isLoading ? (
              <div className="space-y-2 p-2">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-3 bg-cyan-500/20 rounded w-3/4 mb-1" />
                    <div className="h-2 bg-cyan-500/10 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : news.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No news available
              </div>
            ) : (
              news.map((item, index) => {
                const sentiment = analyzeSentiment(item.title);
                
                return (
                  <Sheet key={item.id}>
                    <SheetTrigger asChild>
                      <button
                        className={cn(
                          "w-full text-left p-2 rounded-lg transition-all duration-300 border-b border-cyan-400/10 last:border-0",
                          "hover:bg-cyan-500/10 animate-fade-slide-in"
                        )}
                        style={{ animationDelay: `${index * 30}ms` }}
                        onClick={() => setSelectedArticle({ title: item.title, url: item.url })}
                      >
                        <div className="flex items-start gap-2">
                          {item.imageUrl && (
                            <img 
                              src={item.imageUrl} 
                              alt=""
                              className="w-16 h-12 rounded object-cover flex-shrink-0 border border-cyan-400/20"
                              onError={(e) => (e.currentTarget.style.display = 'none')}
                            />
                          )}
                          <SentimentBadge sentiment={sentiment} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium leading-tight line-clamp-2 text-cyan-100">
                              {item.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] text-cyan-400/70">
                                {item.source}
                              </span>
                              <span className="text-[9px] text-muted-foreground">
                                • {formatDistanceToNow(item.pubDate, { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                          <ExternalLink className="w-3 h-3 text-cyan-400/50 flex-shrink-0 mt-0.5" />
                        </div>
                      </button>
                    </SheetTrigger>
                    <SheetContent side="right" className="w-full sm:w-[600px] sm:max-w-[80vw] p-0 border-cyan-400/20">
                      <SheetHeader className="p-4 border-b border-cyan-400/20">
                        <div className="flex items-start gap-2">
                          <SentimentBadge sentiment={sentiment} />
                          <SheetTitle className="text-left text-sm leading-tight text-cyan-100">
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
                            className="ml-auto text-xs text-cyan-400 hover:underline flex items-center gap-1"
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
    </TooltipProvider>
  );
}
