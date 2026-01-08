import { useState, useEffect, useCallback } from 'react';

interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  pubDate: Date;
}

// Official RSS feeds: Cointelegraph, CoinDesk, Decrypt, Bitcoin.com News, Bloomberg Crypto
const RSS_FEEDS = [
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'Decrypt', url: 'https://decrypt.co/feed' },
  { name: 'Bitcoin.com', url: 'https://news.bitcoin.com/feed/' },
  { name: 'Bloomberg', url: 'https://www.bloomberg.com/feeds/crypto/news.rss' },
];

export function useCryptoNews(refreshIntervalMs = 300000) { // 5 minutes default
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchNews = useCallback(async () => {
    try {
      // Use CORS proxies with fallbacks
      const corsProxies = [
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?',
      ];
      const allNews: NewsItem[] = [];
      
      // Shuffle feeds for variety on each fetch
      const shuffledFeeds = [...RSS_FEEDS].sort(() => Math.random() - 0.5);

      for (const feed of shuffledFeeds) {
        let fetched = false;
        
        for (const proxy of corsProxies) {
          if (fetched) break;
          
          try {
            const response = await fetch(proxy + encodeURIComponent(feed.url), {
              signal: AbortSignal.timeout(8000)
            });
            
            if (!response.ok) continue;
            
            const text = await response.text();
            const parser = new DOMParser();
            const xml = parser.parseFromString(text, 'text/xml');
            
            const items = xml.querySelectorAll('item');
            items.forEach((item, idx) => {
              if (idx >= 4) return; // 4 per source = 20 total max
              
              const title = item.querySelector('title')?.textContent || '';
              const link = item.querySelector('link')?.textContent || '';
              const pubDate = item.querySelector('pubDate')?.textContent || '';
              
              if (title && link) {
                allNews.push({
                  id: `${feed.name}-${idx}-${Date.now()}`,
                  title: title.trim().replace(/<!\[CDATA\[|\]\]>/g, ''),
                  source: feed.name,
                  url: link.trim(),
                  pubDate: pubDate ? new Date(pubDate) : new Date()
                });
              }
            });
            fetched = true;
          } catch (feedErr) {
            // Try next proxy
          }
        }
        
        if (!fetched) {
          console.warn(`[useCryptoNews] All proxies failed for ${feed.name}`);
        }
      }

      // Sort by date, newest first
      allNews.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
      
      // Limit to 12 items for display
      setNews(allNews.slice(0, 12));
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error('[useCryptoNews] Error:', err);
      setError('Failed to load news');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [fetchNews, refreshIntervalMs]);

  return { news, isLoading, error, lastUpdate, refetch: fetchNews };
}