import { useState, useEffect, useCallback } from 'react';
import { Target, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store/useAppStore';
import { OrderManager } from '@/lib/orderManager';
import { toast } from 'sonner';
import { ActionButton } from '@/components/ui/ActionButton';
import { BUTTON_TOOLTIPS } from '@/config/buttonTooltips';

interface Position {
  id: string;
  exchange_name: string;
  symbol: string;
  side: string;
  size: number;
  entry_price: number;
  current_price: number | null;
  unrealized_pnl: number | null;
}

export function PositionsPanel() {
  const lastUpdate = useAppStore(state => state.lastUpdate);
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [closingId, setClosingId] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    const { data, error } = await supabase
      .from('positions')
      .select('*')
      .or('status.eq.open,status.is.null')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPositions(data as Position[]);
    }
    setIsLoading(false);
  }, []);

  // Use SSOT lastUpdate to trigger refetch
  useEffect(() => {
    fetchPositions();
  }, [fetchPositions, lastUpdate]);

  const handleClosePosition = async (position: Position) => {
    setClosingId(position.id);
    try {
      await OrderManager.getInstance().closePosition(position.id);
      toast.success(`Position closed for ${position.symbol}`);
      fetchPositions();
    } catch (error: any) {
      console.error('Failed to close position:', error);
      toast.error(error.message || 'Failed to close position');
    } finally {
      setClosingId(null);
    }
  };

  const formatPnl = (pnl: number | null) => {
    if (pnl === null) return '-';
    const formatted = Math.abs(pnl).toFixed(2);
    if (pnl >= 0) {
      return <span className="text-success">+${formatted}</span>;
    }
    return <span className="text-destructive">-${formatted}</span>;
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          Open Positions
          <span className="text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded">LIVE</span>
          <Badge variant="outline" className="ml-auto">{positions.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No open positions
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Exchange</TableHead>
                  <TableHead className="text-xs">Symbol</TableHead>
                  <TableHead className="text-xs">Side</TableHead>
                  <TableHead className="text-xs text-right">Size</TableHead>
                  <TableHead className="text-xs text-right">Entry</TableHead>
                  <TableHead className="text-xs text-right">Current</TableHead>
                  <TableHead className="text-xs text-right">P&L</TableHead>
                  <TableHead className="text-xs text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((position) => (
                  <TableRow key={position.id}>
                    <TableCell className="text-xs">{position.exchange_name}</TableCell>
                    <TableCell className="text-xs font-medium">{position.symbol}</TableCell>
                    <TableCell>
                      <div className={`flex items-center gap-1 text-xs ${position.side === 'buy' || position.side === 'long' ? 'text-success' : 'text-destructive'}`}>
                        {position.side === 'buy' || position.side === 'long' ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {position.side.toUpperCase()}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      ${position.size.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      ${position.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      {position.current_price 
                        ? `$${position.current_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      {formatPnl(position.unrealized_pnl)}
                    </TableCell>
                    <TableCell className="text-right">
                      <ActionButton
                        tooltip={BUTTON_TOOLTIPS.closePosition}
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleClosePosition(position)}
                        disabled={closingId === position.id}
                      >
                        {closingId === position.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          'Close'
                        )}
                      </ActionButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
