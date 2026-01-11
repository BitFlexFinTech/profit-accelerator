import { useState, useEffect, useCallback } from 'react';
import { StatusDot } from '@/components/ui/StatusDot';
import { AlertTriangle, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Position {
  id: string;
  unrealized_pnl: number | null;
}

export function UnderwaterPositionsCompactBar() {
  const [count, setCount] = useState(0);
  const [totalLoss, setTotalLoss] = useState(0);

  const fetchPositions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('positions')
        .select('id, unrealized_pnl')
        .or('status.eq.open,status.is.null')
        .lt('unrealized_pnl', 0);

      if (!error && data) {
        setCount(data.length);
        setTotalLoss(data.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0));
      }
    } catch (err) {
      console.error('Failed to fetch underwater positions:', err);
    }
  }, []);

  useEffect(() => {
    fetchPositions();

    const channel = supabase
      .channel('underwater-compact-realtime')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'positions' 
      }, () => {
        fetchPositions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPositions]);

  const hasPositions = count > 0;

  return (
    <div className={cn(
      "h-full px-3 flex items-center justify-between rounded border transition-all",
      hasPositions 
        ? "bg-red-500/10 border-red-500/30" 
        : "bg-emerald-500/10 border-emerald-500/30"
    )}>
      <div className="flex items-center gap-2">
          <StatusDot color={hasPositions ? "destructive" : "success"} pulse={hasPositions} />
        {hasPositions ? (
          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
        ) : (
          <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
        )}
        <span className="text-xs font-medium">Underwater</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className={hasPositions ? 'text-red-400 font-medium' : 'text-emerald-400'}>
          {count} position{count !== 1 ? 's' : ''}
        </span>
        {totalLoss < 0 && (
          <span className="text-red-400 font-mono font-bold">
            ${totalLoss.toFixed(2)}
          </span>
        )}
        {!hasPositions && (
          <span className="text-emerald-400 font-medium">All Clear</span>
        )}
      </div>
    </div>
  );
}