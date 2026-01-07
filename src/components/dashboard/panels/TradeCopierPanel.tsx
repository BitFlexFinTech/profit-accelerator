import { useState, useEffect } from 'react';
import { Copy, ArrowRight, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

interface CopierStats {
  copiesToday: number;
  successRate: number;
  avgDelayMs: number;
}

export function TradeCopierPanel() {
  const [stats, setStats] = useState<CopierStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const masterExchange = 'Bybit';
  const mirrorExchanges = ['OKX', 'Bitget', 'BingX'];

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch trade copies from today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { data: copies } = await supabase
          .from('trade_copies')
          .select('*')
          .eq('is_active', true);

        // Fetch recent trades to calculate success rate
        const { data: trades } = await supabase
          .from('trading_journal')
          .select('status, created_at')
          .gte('created_at', today.toISOString())
          .order('created_at', { ascending: false })
          .limit(100);

        if (trades && trades.length > 0) {
          const successCount = trades.filter(t => t.status !== 'error').length;
          const successRate = Math.round((successCount / trades.length) * 100);
          
          setStats({
            copiesToday: trades.length,
            successRate: successRate || 0,
            avgDelayMs: 0 // Would need trade_copier_logs table for real delay
          });
        } else {
          setStats({ copiesToday: 0, successRate: 0, avgDelayMs: 0 });
        }

        setIsActive(copies && copies.length > 0);
      } catch (err) {
        console.error('[TradeCopierPanel] Error:', err);
        setStats({ copiesToday: 0, successRate: 0, avgDelayMs: 0 });
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('trade-copier-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trade_copies' }, () => {
        fetchStats();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trading_journal' }, () => {
        fetchStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Copy className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Trade Copier</h3>
        </div>
        <div className="flex items-center gap-2">
          {isActive ? (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-success/20">
              <div className="status-online" />
              <span className="text-xs text-success font-medium">Active</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted">
              <div className="status-offline" />
              <span className="text-xs text-muted-foreground font-medium">Inactive</span>
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Copy Flow Visualization */}
      <div className="flex items-center justify-center gap-3 mb-4 py-4">
        <div className="p-3 rounded-lg bg-accent/20 border border-accent/30">
          <p className="text-xs text-muted-foreground mb-1">Master</p>
          <p className="font-bold text-accent">{masterExchange}</p>
        </div>
        
        <div className="flex items-center gap-1 text-muted-foreground">
          <ArrowRight className="w-4 h-4" />
          <ArrowRight className="w-4 h-4 -ml-2" />
        </div>

        <div className="flex flex-wrap gap-2">
          {mirrorExchanges.map((exchange) => (
            <div key={exchange} className="p-2 rounded-lg bg-secondary/50 border border-border">
              <p className="text-sm font-medium">{exchange}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-secondary/30 text-center">
          {isLoading ? (
            <Skeleton className="h-8 w-12 mx-auto mb-1" />
          ) : (
            <p className="text-2xl font-bold">{stats?.copiesToday ?? '--'}</p>
          )}
          <p className="text-xs text-muted-foreground">Copies Today</p>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30 text-center">
          {isLoading ? (
            <Skeleton className="h-8 w-12 mx-auto mb-1" />
          ) : (
            <p className={`text-2xl font-bold ${(stats?.successRate ?? 0) > 90 ? 'text-success' : 'text-foreground'}`}>
              {stats?.successRate ?? '--'}%
            </p>
          )}
          <p className="text-xs text-muted-foreground">Success Rate</p>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30 text-center">
          {isLoading ? (
            <Skeleton className="h-8 w-12 mx-auto mb-1" />
          ) : (
            <p className="text-2xl font-bold">
              {stats?.avgDelayMs ? `${stats.avgDelayMs}ms` : '--'}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Avg Delay</p>
        </div>
      </div>
    </div>
  );
}
