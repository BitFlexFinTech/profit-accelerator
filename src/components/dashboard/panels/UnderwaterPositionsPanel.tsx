import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Clock, TrendingDown, Loader2, X, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store/useAppStore';
import { OrderManager } from '@/lib/orderManager';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { IconContainer } from '@/components/ui/IconContainer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Position {
  id: string;
  exchange_name: string;
  symbol: string;
  side: string;
  size: number;
  entry_price: number;
  current_price: number | null;
  unrealized_pnl: number | null;
  created_at: string | null;
  status: string | null;
}

export function UnderwaterPositionsPanel() {
  const lastUpdate = useAppStore(state => state.lastUpdate);
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState<Position | null>(null);
  const [now, setNow] = useState(Date.now());

  // Update time every 30 seconds for hold duration
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchPositions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .or('status.eq.open,status.is.null')
        .lt('unrealized_pnl', 0) // Only underwater positions
        .order('unrealized_pnl', { ascending: true }); // Worst losses first

      if (!error && data) {
        setPositions(data as Position[]);
      }
    } catch (err) {
      console.error('Failed to fetch underwater positions:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();

    // Realtime subscription for position updates
    const channel = supabase
      .channel('underwater-positions-realtime')
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
  }, [fetchPositions, lastUpdate]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchPositions();
  };

  const calculateHoldTime = (createdAt: string | null): string => {
    if (!createdAt) return '-';
    const created = new Date(createdAt).getTime();
    const diffMs = now - created;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
    if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
    return `${diffMins}m`;
  };

  const handleEmergencyClose = async (position: Position) => {
    setConfirmClose(null);
    setClosingId(position.id);
    
    try {
      await OrderManager.getInstance().closePosition(position.id);
      toast.success(
        `EMERGENCY CLOSE: ${position.symbol} position closed at loss of $${Math.abs(position.unrealized_pnl || 0).toFixed(2)}`,
        { duration: 5000 }
      );
      fetchPositions();
    } catch (error: any) {
      console.error('Emergency close failed:', error);
      toast.error(`Failed to close: ${error.message}`);
    } finally {
      setClosingId(null);
    }
  };

  const totalUnrealizedLoss = positions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);

  return (
    <>
      <Card className={cn(
        "glass-card h-full flex flex-col overflow-hidden",
        positions.length > 0 ? "border-destructive/30" : "border-success/30"
      )}>
        <CardHeader className="pb-2 flex-shrink-0 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconContainer color={positions.length > 0 ? "red" : "green"} size="sm">
                {positions.length > 0 ? (
                  <AlertTriangle className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
              </IconContainer>
              <CardTitle className="text-sm font-medium">
                Underwater Positions
              </CardTitle>
              <Badge 
                variant={positions.length > 0 ? "destructive" : "secondary"}
                className="ml-1"
              >
                {positions.length}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {totalUnrealizedLoss < 0 && (
                <span className="text-destructive font-bold text-sm">
                  ${totalUnrealizedLoss.toFixed(2)}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-6 w-6 p-0"
              >
                <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 flex-1 min-h-0 overflow-hidden px-3 pb-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : positions.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-6">
              <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center mb-2">
                <TrendingDown className="h-5 w-5 text-success" />
              </div>
              <p className="text-sm font-medium text-success">All Clear</p>
              <p className="text-xs opacity-70">No underwater positions</p>
            </div>
          ) : (
            <div className="overflow-x-auto h-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Symbol</TableHead>
                    <TableHead className="text-xs">Exchange</TableHead>
                    <TableHead className="text-xs text-right">Entry</TableHead>
                    <TableHead className="text-xs text-right">Current</TableHead>
                    <TableHead className="text-xs text-right">P&L</TableHead>
                    <TableHead className="text-xs text-right">Held</TableHead>
                    <TableHead className="text-xs text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map((position) => (
                    <TableRow key={position.id} className="bg-destructive/5 hover:bg-destructive/10">
                      <TableCell className="text-xs font-medium py-1.5">
                        {position.symbol}
                      </TableCell>
                      <TableCell className="text-xs py-1.5">
                        <Badge variant="outline" className="text-[10px] h-4">
                          {position.exchange_name?.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right py-1.5">
                        ${position.entry_price?.toFixed(4)}
                      </TableCell>
                      <TableCell className="text-xs text-right py-1.5">
                        {position.current_price ? `$${position.current_price.toFixed(4)}` : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-right py-1.5 font-bold text-destructive">
                        ${(position.unrealized_pnl || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-xs text-right py-1.5">
                        <div className="flex items-center justify-end gap-1">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          {calculateHoldTime(position.created_at)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right py-1.5">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-5 px-2 text-[10px]"
                          onClick={() => setConfirmClose(position)}
                          disabled={closingId === position.id}
                        >
                          {closingId === position.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <X className="w-3 h-3 mr-0.5" />
                              Close
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Emergency Close Confirmation Dialog */}
      <AlertDialog open={!!confirmClose} onOpenChange={() => setConfirmClose(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              Emergency Position Close
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                You are about to <strong className="text-destructive">CLOSE</strong> this position at a LOSS:
              </p>
              {confirmClose && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Symbol:</span>
                    <strong>{confirmClose.symbol}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Exchange:</span>
                    <strong>{confirmClose.exchange_name?.toUpperCase()}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Side:</span>
                    <strong>{confirmClose.side?.toUpperCase()}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Entry Price:</span>
                    <strong>${confirmClose.entry_price?.toFixed(4)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Current Price:</span>
                    <strong>${confirmClose.current_price?.toFixed(4) || '-'}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Time Held:</span>
                    <strong>{calculateHoldTime(confirmClose.created_at)}</strong>
                  </div>
                  <div className="flex justify-between text-destructive font-bold border-t border-destructive/30 pt-1 mt-1">
                    <span>Unrealized Loss:</span>
                    <span>${(confirmClose.unrealized_pnl || 0).toFixed(2)}</span>
                  </div>
                </div>
              )}
              <p className="text-destructive font-medium">
                ⚠️ This action is IRREVERSIBLE. The loss will be realized immediately.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel - Keep Position</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => confirmClose && handleEmergencyClose(confirmClose)}
            >
              Confirm Emergency Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
