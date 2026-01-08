import { useState, useEffect, useRef } from 'react';
import { Brain, TrendingUp, TrendingDown, Minus, RefreshCw, Zap, Globe, Server } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAppStore } from '@/store/useAppStore';
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

export function AIMarketUpdatesPanel() {
  const [updates, setUpdates] = useState<AIUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [nextScanIn, setNextScanIn] = useState(60);
  const hasAutoScanned = useRef(false);
  
  const exchangePulse = useAppStore(state => state.exchangePulse);
  const { vps } = useSystemStatus();

  // VPS connection status
  const isVpsConnected = vps.status === 'running' || vps.status === 'idle';

  // Get Tokyo HFT latency from exchange pulse (exchangePulse is a Record)
  const binanceLatency = exchangePulse['binance']?.latencyMs || 0;
  const okxLatency = exchangePulse['okx']?.latencyMs || 0;

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

    // Scan every 60 seconds for real-time analysis
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
        toast.success(`AI analyzed ${data.analyzed || 0} assets from ${data.exchange || 'connected exchanges'}`);
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
        return <TrendingUp className="w-4 h-4 text-success" />;
      case 'BEARISH':
        return <TrendingDown className="w-4 h-4 text-destructive" />;
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />;
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

  // Group updates by exchange
  const binanceUpdates = updates.filter(u => u.exchange_name?.toLowerCase() === 'binance');
  const okxUpdates = updates.filter(u => u.exchange_name?.toLowerCase() === 'okx');

  return (
    <div className="glass-card p-4 flex flex-col min-h-0 h-full">
      {/* Header - Enhanced */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <Brain className="w-5 h-5 text-purple-400 animate-pulse" />
          </div>
          <div>
            <h3 className="font-semibold text-base">AI Market Analysis</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                24/7 Active
              </span>
              <span>•</span>
              <span>Next scan: {nextScanIn}s</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* VPS Connection Status */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${isVpsConnected ? 'bg-success/10' : 'bg-secondary/50'}`}>
            <Server className={`w-3.5 h-3.5 ${isVpsConnected ? 'text-success' : 'text-muted-foreground'}`} />
            <span className={`text-xs font-medium ${isVpsConnected ? 'text-success' : 'text-muted-foreground'}`}>
              {isVpsConnected ? 'VPS Online' : 'VPS Offline'}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={triggerManualScan}
            disabled={isScanning}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
            Scan Now
          </Button>
        </div>
      </div>

      {/* Tokyo HFT Latency Indicators */}
      <div className="flex gap-2 mb-3 flex-shrink-0">
        <div className="flex-1 p-2 rounded-lg bg-secondary/30 flex items-center gap-2">
          <Globe className="w-4 h-4 text-yellow-500" />
          <span className="text-xs font-medium">Binance</span>
          <Badge variant="outline" className={`ml-auto text-xs ${binanceLatency < 500 ? 'text-success border-success/30' : 'text-warning border-warning/30'}`}>
            <Zap className="w-3 h-3 mr-1" />
            {binanceLatency}ms
          </Badge>
        </div>
        <div className="flex-1 p-2 rounded-lg bg-secondary/30 flex items-center gap-2">
          <Globe className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-medium">OKX</span>
          <Badge variant="outline" className={`ml-auto text-xs ${okxLatency < 500 ? 'text-success border-success/30' : 'text-warning border-warning/30'}`}>
            <Zap className="w-3 h-3 mr-1" />
            {okxLatency}ms
          </Badge>
        </div>
      </div>

      {/* Error Display */}
      {scanError && (
        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded mb-2 flex-shrink-0">
          {scanError}
        </div>
      )}

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Brain className="w-8 h-8 animate-pulse mr-2" />
            Loading AI insights...
          </div>
        ) : updates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Brain className="w-12 h-12 opacity-30" />
            <p className="text-sm">No AI insights yet</p>
            <p className="text-xs">Connect an exchange and enable Groq AI in Settings</p>
          </div>
        ) : (
          updates.map((update) => (
            <div 
              key={update.id} 
              className="p-3 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors border border-border/30"
            >
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-xs text-muted-foreground">
                  {format(new Date(update.created_at), 'HH:mm:ss')}
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {update.exchange_name?.toUpperCase()}
                </Badge>
                <span className="font-bold text-sm">{update.symbol}</span>
                <span className="text-sm font-medium">
                  ${update.current_price?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '—'}
                </span>
                {update.price_change_24h !== null && (
                  <span className={`text-sm font-medium ${update.price_change_24h >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {update.price_change_24h >= 0 ? '+' : ''}{update.price_change_24h.toFixed(2)}%
                  </span>
                )}
                <div className={`ml-auto px-2 py-1 rounded flex items-center gap-1.5 ${getSentimentClass(update.sentiment)}`}>
                  {getSentimentIcon(update.sentiment)}
                  <span className="text-xs font-medium">{update.sentiment}</span>
                </div>
              </div>
              
              {/* Confidence Bar */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-muted-foreground">Confidence:</span>
                <Progress value={update.confidence} className="h-1.5 flex-1" />
                <span className="text-xs font-medium">{update.confidence}%</span>
              </div>

              {/* Insight - Show more text */}
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                {update.insight}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Footer Stats */}
      <div className="mt-2 pt-2 border-t border-border/30 flex items-center justify-between text-xs text-muted-foreground flex-shrink-0">
        <span>{updates.length} insights</span>
        <span>Binance: {binanceUpdates.length} | OKX: {okxUpdates.length}</span>
        {lastScanTime && (
          <span>Last scan: {format(lastScanTime, 'HH:mm:ss')}</span>
        )}
      </div>
    </div>
  );
}