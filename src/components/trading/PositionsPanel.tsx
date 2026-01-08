import { useState, useEffect } from 'react';
import { Target, TrendingUp, TrendingDown, X, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store/useAppStore';
import { OrderManager } from '@/lib/orderManager';
import { toast } from 'sonner';

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
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [closingId, setClosingId] = useState<string | null>(null);

  const fetchPositions = async () => {
    const table = paperTradingMode ? 'paper_positions' : 'positions';
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPositions(data as Position[]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchPositions();

    // Set up realtime subscription
    const table = paperTradingMode ? 'paper_positions' : 'positions';
    const channel = supabase
      .channel('positions-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table
      }, () => {
        fetchPositions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [paperTradingMode]);

  const handleClosePosition = async (position: Position) => {
    setClosingId(position.id);
    try {
      if (paperTradingMode) {
        // For paper trading, just delete the position and record PnL
        const pnl = position.unrealized_pnl || 0;
        
        await supabase.from('paper_positions').delete().eq('id', position.id);
        
        // Log the paper close
        await supabase.from('transaction_log').insert({
          action_type: 'paper_position_closed',
          exchange_name: position.exchange_name,
          symbol: position.symbol,
          details: {
            side: position.side,
            size: position.size,
            entryPrice: position.entry_price,
            exitPrice: position.current_price,
            pnl
          },
          status: 'success'
        });
        
        toast.success(`Paper position closed: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
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
                    <Button
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
                    </Button>
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
