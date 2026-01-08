import { useState, useEffect, useCallback } from 'react';
import { History, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store/useAppStore';
import { format } from 'date-fns';

interface Order {
  id: string;
  exchange_name: string;
  symbol: string;
  side: string;
  type: string;
  amount: number;
  price: number | null;
  fill_price?: number | null;
  average_fill_price?: number | null;
  status: string;
  created_at: string;
}

type StatusFilter = 'all' | 'pending' | 'filled' | 'cancelled';

export function OrderHistory() {
  const paperTradingMode = useAppStore(state => state.paperTradingMode);
  const lastUpdate = useAppStore(state => state.lastUpdate);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');

  const fetchOrders = useCallback(async () => {
    const table = paperTradingMode ? 'paper_orders' : 'orders';
    let query = supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (filter !== 'all') {
      query = query.eq('status', filter);
    }

    const { data, error } = await query;

    if (!error && data) {
      setOrders(data as Order[]);
    }
    setIsLoading(false);
  }, [paperTradingMode, filter]);

  // Use SSOT lastUpdate to trigger refetch - no duplicate subscription needed
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders, lastUpdate]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'filled':
        return <Badge className="bg-success/20 text-success border-success/40">Filled</Badge>;
      case 'pending':
      case 'partially_filled':
        return <Badge className="bg-warning/20 text-warning border-warning/40">Pending</Badge>;
      case 'cancelled':
      case 'rejected':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/40">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatTime = (timestamp: string) => {
    return format(new Date(timestamp), 'HH:mm:ss');
  };

  const formatDate = (timestamp: string) => {
    return format(new Date(timestamp), 'MMM dd');
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            Order History
            {paperTradingMode && (
              <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">PAPER</span>
            )}
          </CardTitle>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
            <TabsList className="h-7">
              <TabsTrigger value="all" className="text-xs h-6 px-2">All</TabsTrigger>
              <TabsTrigger value="pending" className="text-xs h-6 px-2">Pending</TabsTrigger>
              <TabsTrigger value="filled" className="text-xs h-6 px-2">Filled</TabsTrigger>
              <TabsTrigger value="cancelled" className="text-xs h-6 px-2">Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No orders yet</p>
            <p className="text-xs mt-1">Place your first trade to see it here</p>
          </div>
        ) : (
          <div className="max-h-[300px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs">Symbol</TableHead>
                  <TableHead className="text-xs">Side</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs text-right">Price</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map(order => (
                  <TableRow key={order.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>{formatTime(order.created_at)}</div>
                      <div className="text-[10px]">{formatDate(order.created_at)}</div>
                    </TableCell>
                    <TableCell className="font-medium text-sm">{order.symbol}</TableCell>
                    <TableCell>
                      <span className={order.side === 'buy' ? 'text-success' : 'text-destructive'}>
                        {order.side.toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {order.type.toUpperCase()}
                    </TableCell>
                    <TableCell className="text-right text-sm">{order.amount}</TableCell>
                    <TableCell className="text-right text-sm">
                      ${(order.fill_price || order.average_fill_price || order.price || 0).toFixed(2)}
                    </TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
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
