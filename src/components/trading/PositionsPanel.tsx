import { useState, useEffect, useCallback } from 'react';
import { Target, TrendingUp, TrendingDown, X, Loader2 } from 'lucide-react';
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
  const paperTradingMode = useAppStore(state => state.paperTradingMode);
  const lastUpdate = useAppStore(state => state.lastUpdate);
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [closingId, setClosingId] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    // All positions now stored in 'positions' table - VPS bot handles all modes
    const { data, error } = await supabase
      .from('positions')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPositions(data as Position[]);
    }
    setIsLoading(false);
  }, []);

  // Use SSOT lastUpdate to trigger refetch - no duplicate subscription needed
  useEffect(() => {
    fetchPositions();
  }, [fetchPositions, lastUpdate]);

  const handleClosePosition = async (position: Position) => {
    setClosingId(position.id);
    try {
      // All position management now goes through OrderManager which uses VPS bot
      if (paperTradingMode) {
        // In paper mode, positions are managed by VPS bot - just notify user
        toast.info('Paper positions are managed automatically by the trading bot');
        setClosingId(null);
        return;
      } else {
        // For live trading, use OrderManager to place offsetting order
        await OrderManager.getInstance().closePosition(position.id);
        toast.success(`Position closed for ${position.symbol}`);
      }
      
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
          {paperTradingMode && (
            <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">PAPER</span>
          )}
          <Badge variant="outline" className="ml-auto">{positions.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No open positions</p>
            <p className="text-xs mt-1">Your active trades will appear here</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Symbol</TableHead>
                <TableHead className="text-xs">Side</TableHead>
                <TableHead className="text-xs text-right">Size</TableHead>
                <TableHead className="text-xs text-right">Entry</TableHead>
                <TableHead className="text-xs text-right">Current</TableHead>
                <TableHead className="text-xs text-right">P&L</TableHead>
                <TableHead className="text-xs w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map(pos => (
                <TableRow key={pos.id}>
                  <TableCell className="font-medium text-sm">
                    {pos.symbol}
                    <span className="text-xs text-muted-foreground ml-1">{pos.exchange_name}</span>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={pos.side === 'long' 
                        ? 'text-success border-success/50' 
                        : 'text-destructive border-destructive/50'
                      }
                    >
                      {pos.side === 'long' ? (
                        <TrendingUp className="w-3 h-3 mr-1" />
                      ) : (
                        <TrendingDown className="w-3 h-3 mr-1" />
                      )}
                      {pos.side.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm">{pos.size}</TableCell>
                  <TableCell className="text-right text-sm">${pos.entry_price?.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-sm">
                    {pos.current_price ? `$${pos.current_price.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {formatPnl(pos.unrealized_pnl)}
                  </TableCell>
                  <TableCell>
                    <ActionButton
                      tooltip={BUTTON_TOOLTIPS.closePosition}
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleClosePosition(pos)}
                      disabled={closingId === pos.id}
                    >
                      {closingId === pos.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                    </ActionButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
