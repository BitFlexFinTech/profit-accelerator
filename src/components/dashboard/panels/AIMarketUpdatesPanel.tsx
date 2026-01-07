import { useState, useEffect, useRef } from 'react';
import { Brain, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface AIUpdate {
  id: string;
  symbol: string;
  exchange_name: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  insight: string;
  current_price: number;
  price_change_24h: number;
  created_at: string;
}

export function AIMarketUpdatesPanel() {
  const [updates, setUpdates] = useState<AIUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const hasAutoScanned = useRef(false);

  // Auto-scan on mount if AI is configured and no recent updates exist
  const triggerAutoScan = async () => {
    if (hasAutoScanned.current) return;
    hasAutoScanned.current = true;
    
    try {
      // Check if AI is configured
      const { data: aiConfig } = await supabase
        .from('ai_config')
        .select('api_key, is_active')
        .eq('provider', 'groq')
        .single();
      
      if (!aiConfig?.api_key || !aiConfig?.is_active) {
        console.log('[AIMarketUpdatesPanel] AI not configured, skipping auto-scan');
        return;
      }
      
      // Check if there are recent updates (within last 5 minutes)
      const { data: recentUpdates } = await supabase
        .from('ai_market_updates')
        .select('id')
        .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .limit(1);
      
      if (recentUpdates?.length) {
        console.log('[AIMarketUpdatesPanel] Recent updates exist, skipping auto-scan');
        return;
      }
      
      console.log('[AIMarketUpdatesPanel] Triggering auto-scan...');
      await supabase.functions.invoke('ai-analyze', {
        body: { action: 'market-scan' }
      });
    } catch (err) {
      console.error('[AIMarketUpdatesPanel] Auto-scan error:', err);
    }
  };

  useEffect(() => {
    const fetchUpdates = async () => {
      try {
        const { data, error } = await supabase
          .from('ai_market_updates')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw error;
        setUpdates((data as AIUpdate[]) || []);
        
        // Trigger auto-scan after initial fetch if no updates
        if (!data?.length) {
          triggerAutoScan();
        }
      } catch (err) {
        console.error('[AIMarketUpdatesPanel] Error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUpdates();

    // Subscribe to realtime inserts
    const channel = supabase
      .channel('ai-updates-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ai_market_updates'
      }, (payload) => {
        setUpdates(prev => [payload.new as AIUpdate, ...prev.slice(0, 19)]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const triggerManualScan = async () => {
    setIsScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { action: 'market-scan' }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`AI analyzed ${data.analyzed || 0} assets from ${data.exchange || 'connected exchange'}`);
      } else {
        toast.error(data?.error || 'AI scan failed');
      }
    } catch (err) {
      console.error('[AIMarketUpdatesPanel] Scan error:', err);
      toast.error('Failed to trigger AI scan');
    } finally {
      setIsScanning(false);
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'BULLISH':
        return <TrendingUp className="w-3 h-3 text-success" />;
      case 'BEARISH':
        return <TrendingDown className="w-3 h-3 text-destructive" />;
      default:
        return <Minus className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const getSentimentClass = (sentiment: string) => {
    switch (sentiment) {
      case 'BULLISH':
        return 'bg-success/20 text-success';
      case 'BEARISH':
        return 'bg-destructive/20 text-destructive';
      default:
        return 'bg-secondary text-muted-foreground';
    }
  };

  return (
    <div className="glass-card p-3 flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-400 animate-pulse" />
          <span className="font-medium text-sm">AI Market Analysis</span>
          <span className="text-xs text-success bg-success/10 px-1.5 py-0.5 rounded-full">● 24/7</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={triggerManualScan}
          disabled={isScanning}
          className="h-6 px-2 text-xs"
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${isScanning ? 'animate-spin' : ''}`} />
          Scan
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading AI insights...
          </div>
        ) : updates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
            <Brain className="w-8 h-8 opacity-30" />
            <p>No AI insights yet</p>
            <p className="text-xs">Connect an exchange and configure Groq AI</p>
          </div>
        ) : (
          updates.map((update) => (
            <div key={update.id} className="text-xs p-2 rounded bg-secondary/20 hover:bg-secondary/30 transition-colors">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-muted-foreground">
                  {format(new Date(update.created_at), 'HH:mm')}
                </span>
                <span className="px-1 py-0.5 rounded bg-primary/20 text-primary text-[10px] uppercase">
                  {update.exchange_name}
                </span>
                <span className="font-semibold">{update.symbol}</span>
                <span className="text-muted-foreground">
                  ${update.current_price?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '—'}
                </span>
                {update.price_change_24h !== null && (
                  <span className={update.price_change_24h >= 0 ? 'text-success' : 'text-destructive'}>
                    {update.price_change_24h >= 0 ? '+' : ''}{update.price_change_24h.toFixed(2)}%
                  </span>
                )}
                <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 ${getSentimentClass(update.sentiment)}`}>
                  {getSentimentIcon(update.sentiment)}
                  {update.sentiment} {update.confidence}%
                </span>
              </div>
              <p className="text-muted-foreground mt-1 line-clamp-2">{update.insight}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}