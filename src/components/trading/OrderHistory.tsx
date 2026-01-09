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
  const lastUpdate = useAppStore(state => state.lastUpdate);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');

  const fetchOrders = useCallback(async () => {
    let query = supabase
      .from('orders')
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
  }, [filter]);

  // Use SSOT lastUpdate to trigger refetch
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders, lastUpdate]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'filled': return 'bg-success/20 text-success';
      case 'pending': return 'bg-warning/20 text-warning';
      case 'cancelled': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getSideColor = (side: string) => {
    return side === 'buy' ? 'text-success' : 'text-destructive';
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            Order History
            <span className="text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded">LIVE</span>
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
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No orders found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs">Exchange</TableHead>
                  <TableHead className="text-xs">Symbol</TableHead>
                  <TableHead className="text-xs">Side</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs text-right">Price</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(order.created_at), 'HH:mm:ss')}
                    </TableCell>
                    <TableCell className="text-xs">{order.exchange_name}</TableCell>
                    <TableCell className="text-xs font-medium">{order.symbol}</TableCell>
                    <TableCell className={`text-xs font-medium ${getSideColor(order.side)}`}>
                      {order.side.toUpperCase()}
                    </TableCell>
                    <TableCell className="text-xs">{order.type}</TableCell>
                    <TableCell className="text-xs text-right">
                      ${order.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      {order.average_fill_price || order.price 
                        ? `$${(order.average_fill_price || order.price)?.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                        : 'Market'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${getStatusColor(order.status)}`}>
                        {order.status}
                      </Badge>
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
