import { useState, useEffect, useCallback } from 'react';

interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  pubDate: Date;
}

// Free RSS feed sources for crypto news
const RSS_FEEDS = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'CryptoSlate', url: 'https://cryptoslate.com/feed/' },
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
];

export function useCryptoNews(refreshIntervalMs = 300000) { // 5 minutes default
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchNews = useCallback(async () => {
    try {
      // Use a CORS proxy for RSS feeds
      const corsProxy = 'https://api.allorigins.win/raw?url=';
      const allNews: NewsItem[] = [];

      for (const feed of RSS_FEEDS) {
        try {
          const response = await fetch(corsProxy + encodeURIComponent(feed.url), {
            signal: AbortSignal.timeout(10000)
          });
          
          if (!response.ok) continue;
          
          const text = await response.text();
          const parser = new DOMParser();
          const xml = parser.parseFromString(text, 'text/xml');
          
          const items = xml.querySelectorAll('item');
          items.forEach((item, idx) => {
            if (idx >= 5) return; // 5 per source = 15 total
            
            const title = item.querySelector('title')?.textContent || '';
            const link = item.querySelector('link')?.textContent || '';
            const pubDate = item.querySelector('pubDate')?.textContent || '';
            
            if (title && link) {
              allNews.push({
                id: `${feed.name}-${idx}`,
                title: title.trim(),
                source: feed.name,
                url: link.trim(),
                pubDate: new Date(pubDate)
              });
            }
          });
        } catch (feedErr) {
          console.warn(`[useCryptoNews] Failed to fetch ${feed.name}:`, feedErr);
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