import { useState, useEffect, useCallback } from 'react';

interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  pubDate: Date;
  imageUrl?: string;
}

// Official RSS feeds: Cointelegraph, CoinDesk, Decrypt, Bitcoin.com News, Bloomberg Crypto
const RSS_FEEDS = [
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'Decrypt', url: 'https://decrypt.co/feed' },
  { name: 'Bitcoin.com', url: 'https://news.bitcoin.com/feed/' },
  { name: 'Bloomberg', url: 'https://www.bloomberg.com/feeds/crypto/news.rss' },
];

// Extract image URL from RSS item
function extractImageUrl(item: Element): string | undefined {
  // Try media:content (Cointelegraph, many others)
  const mediaContent = item.getElementsByTagName('media:content')[0];
  if (mediaContent?.getAttribute('url')) {
    return mediaContent.getAttribute('url') || undefined;
  }

  // Try media:thumbnail
  const mediaThumbnail = item.getElementsByTagName('media:thumbnail')[0];
  if (mediaThumbnail?.getAttribute('url')) {
    return mediaThumbnail.getAttribute('url') || undefined;
  }

  // Try enclosure with image type
  const enclosures = item.getElementsByTagName('enclosure');
  for (let i = 0; i < enclosures.length; i++) {
    const type = enclosures[i].getAttribute('type') || '';
    if (type.startsWith('image/')) {
      return enclosures[i].getAttribute('url') || undefined;
    }
  }

  // Try image tag directly
  const imageTag = item.getElementsByTagName('image')[0];
  if (imageTag) {
    const urlTag = imageTag.getElementsByTagName('url')[0];
    if (urlTag?.textContent) {
      return urlTag.textContent;
    }
  }

  // Fallback: Parse description/content:encoded for first img tag
  const description = item.querySelector('description')?.textContent || '';
  const contentEncoded = item.getElementsByTagName('content:encoded')[0]?.textContent || '';
  const htmlContent = contentEncoded || description;
  
  const imgMatch = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch?.[1]) {
    // Clean up URL (remove CDATA if present)
    return imgMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
  }

  return undefined;
}

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
              const imageUrl = extractImageUrl(item);
              
              if (title && link) {
                allNews.push({
                  id: `${feed.name}-${idx}-${Date.now()}`,
                  title: title.trim().replace(/<!\[CDATA\[|\]\]>/g, ''),
                  source: feed.name,
                  url: link.trim(),
                  pubDate: pubDate ? new Date(pubDate) : new Date(),
                  imageUrl
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