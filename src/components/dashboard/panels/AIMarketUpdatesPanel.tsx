import { useState, useEffect, useRef } from 'react';
import { Brain, TrendingUp, TrendingDown, Minus, RefreshCw, Server } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { useSystemStatus } from '@/hooks/useSystemStatus';

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

interface AIMarketUpdatesPanelProps {
  fullHeight?: boolean;
}

export function AIMarketUpdatesPanel({ fullHeight = false }: AIMarketUpdatesPanelProps) {
  const [updates, setUpdates] = useState<AIUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [nextScanIn, setNextScanIn] = useState(60);
  const hasAutoScanned = useRef(false);
  
  const { vps } = useSystemStatus();
  const isVpsConnected = vps.status === 'running' || vps.status === 'idle';

  const triggerAutoScan = async () => {
    try {
      const { data: aiConfig } = await supabase
        .from('ai_config')
        .select('is_active')
        .eq('provider', 'groq')
        .single();
      
      if (!aiConfig?.is_active) return;
      
      const { data: recentUpdates } = await supabase
        .from('ai_market_updates')
        .select('id')
        .gte('created_at', new Date(Date.now() - 60 * 1000).toISOString())
        .limit(1);
      
      if (recentUpdates?.length) return;
      
      setScanError(null);
      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { action: 'market-scan' }
      });
      
      if (error || !data?.success) {
        const errMsg = data?.error || error?.message || 'Scan failed';
        setScanError(errMsg);
      } else {
        setLastScanTime(new Date());
      }
    } catch (err) {
      console.error('[AIMarketUpdatesPanel] Auto-scan error:', err);
    }
  };

  // Countdown timer for next scan
  useEffect(() => {
    const countdownInterval = setInterval(() => {
      setNextScanIn(prev => (prev > 0 ? prev - 1 : 60));
    }, 1000);
    return () => clearInterval(countdownInterval);
  }, []);

  useEffect(() => {
    const fetchUpdates = async () => {
      try {
        const { data, error } = await supabase
          .from('ai_market_updates')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(30);

        if (error) throw error;
        setUpdates((data as AIUpdate[]) || []);
        
        if (!hasAutoScanned.current) {
          hasAutoScanned.current = true;
          triggerAutoScan();
        }
      } catch (err) {
        console.error('[AIMarketUpdatesPanel] Error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUpdates();

    const channel = supabase
      .channel('ai-updates-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ai_market_updates'
      }, (payload) => {
        setScanError(null);
        setUpdates(prev => [payload.new as AIUpdate, ...prev.slice(0, 29)]);
        setLastScanTime(new Date());
      })
      .subscribe();

    const scanInterval = setInterval(() => {
      hasAutoScanned.current = false;
      setNextScanIn(60);
      triggerAutoScan();
    }, 60 * 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(scanInterval);
    };
  }, []);

  const triggerManualScan = async () => {
    setIsScanning(true);
    setNextScanIn(60);
    try {
      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { action: 'market-scan' }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`AI analyzed ${data.analyzed || 0} assets`);
        setLastScanTime(new Date());
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
        return 'bg-success/20 text-success border-success/30';
      case 'BEARISH':
        return 'bg-destructive/20 text-destructive border-destructive/30';
      default:
        return 'bg-secondary text-muted-foreground';
    }
  };

  const binanceUpdates = updates.filter(u => u.exchange_name?.toLowerCase() === 'binance');
  const okxUpdates = updates.filter(u => u.exchange_name?.toLowerCase() === 'okx');

  return (
    <div className={`glass-card p-3 flex flex-col min-h-0 ${fullHeight ? 'h-full' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/20">
            <Brain className="w-4 h-4 text-purple-400 animate-pulse" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">AI Market Analysis</h3>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                24/7
              </span>
              <span>Next: {nextScanIn}s</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${isVpsConnected ? 'bg-success/10 text-success' : 'bg-secondary/50 text-muted-foreground'}`}>
            <Server className="w-3 h-3" />
            {isVpsConnected ? 'VPS' : 'Off'}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={triggerManualScan}
            disabled={isScanning}
            className="h-6 px-2 text-xs gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
            Scan
          </Button>
        </div>
      </div>

      {/* Error Display */}
      {scanError && (
        <div className="text-[10px] text-destructive bg-destructive/10 p-1.5 rounded mb-2 flex-shrink-0">
          {scanError}
        </div>
      )}

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Brain className="w-6 h-6 animate-pulse mr-2" />
            Loading...
          </div>
        ) : updates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Brain className="w-10 h-10 opacity-30" />
            <p className="text-xs">No AI insights yet</p>
            <p className="text-[10px]">Connect exchange + enable Groq AI</p>
          </div>
        ) : (
          updates.map((update) => (
            <div 
              key={update.id} 
              className="p-2 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors border border-border/30"
            >
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(update.created_at), 'HH:mm:ss')}
                </span>
                <span className="text-[9px] px-1 py-0 rounded border border-border">
                  {update.exchange_name?.toUpperCase()}
                </span>
                <span className="font-bold text-xs">{update.symbol}</span>
                <span className="text-xs">
                  ${update.current_price?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '—'}
                </span>
                {update.price_change_24h !== null && (
                  <span className={`text-xs ${update.price_change_24h >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {update.price_change_24h >= 0 ? '+' : ''}{update.price_change_24h.toFixed(2)}%
                  </span>
                )}
                <div className={`ml-auto px-1.5 py-0.5 rounded flex items-center gap-1 ${getSentimentClass(update.sentiment)}`}>
                  {getSentimentIcon(update.sentiment)}
                  <span className="text-[10px] font-medium">{update.sentiment}</span>
                </div>
              </div>
              
              {/* Confidence Bar */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-muted-foreground">Conf:</span>
                <Progress value={update.confidence} className="h-1 flex-1" />
                <span className="text-[10px] font-medium">{update.confidence}%</span>
              </div>

              {/* Insight */}
              <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
                {update.insight}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Footer Stats */}
      <div className="mt-1.5 pt-1.5 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground flex-shrink-0">
        <span>{updates.length} insights</span>
        <span>Binance: {binanceUpdates.length} | OKX: {okxUpdates.length}</span>
        {lastScanTime && (
          <span>Last: {format(lastScanTime, 'HH:mm')}</span>
        )}
      </div>
    </div>
  );
}
