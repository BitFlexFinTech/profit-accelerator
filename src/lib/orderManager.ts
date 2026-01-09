import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

interface OrderRequest {
  exchangeName: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  amount: number;
  price?: number;
  maxSlippage?: number;
  stopLoss?: number;
  takeProfit?: number;
}

interface Order {
  id: string;
  exchange_name: string;
  symbol: string;
  side: string;
  type: string;
  amount: number;
  price: number | null;
  filled_amount: number;
  average_fill_price: number | null;
  status: string;
  exchange_order_id: string | null;
  client_order_id: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  filled_at: string | null;
  cancelled_at: string | null;
  version: number;
}

export class OrderManager {
  private static instance: OrderManager;
  private pendingOrders = new Map<string, ReturnType<typeof setTimeout>>();

  static getInstance(): OrderManager {
    if (!OrderManager.instance) {
      OrderManager.instance = new OrderManager();
    }
    return OrderManager.instance;
  }

  async placeOrder(request: OrderRequest): Promise<string> {
    const clientOrderId = uuidv4();
    const idempotencyKey = uuidv4();

    // Insert order into database first
    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        exchange_name: request.exchangeName,
        symbol: request.symbol,
        side: request.side,
        type: request.type,
        amount: request.amount,
        price: request.price || null,
        status: 'pending',
        client_order_id: clientOrderId,
        idempotency_key: idempotencyKey
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create order: ${error.message}`);
    if (!order) throw new Error('Order creation returned no data');

    try {
      // Check for running VPS to route through for lowest latency
      const { data: vpsConfig } = await supabase
        .from('vps_config')
        .select('outbound_ip, status')
        .eq('status', 'running')
        .not('outbound_ip', 'is', null)
        .limit(1);

      const vpsIp = vpsConfig?.[0]?.outbound_ip;

      // STRICT RULE: VPS-ONLY execution for HFT scalping - NO FALLBACK
      if (!vpsIp) {
        throw new Error('VPS not available. HFT bot requires VPS for trade execution. Please ensure VPS is running with a valid IP address.');
      }
      
      console.log('[OrderManager] Routing order through VPS for HFT:', vpsIp);
      const result = await this.executeViaVPS(vpsIp, request, clientOrderId);

      // Update order with execution response
      await supabase
        .from('orders')
        .update({
          exchange_order_id: result?.orderId || null,
          status: result?.success ? 'filled' : 'rejected',
          average_fill_price: result?.executedPrice || null,
          filled_amount: result?.success ? request.amount : 0,
          filled_at: result?.success ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      // Log transaction with latency info
      await this.logTransaction('order_placed', request.exchangeName, request.symbol, {
        orderId: order.id,
        clientOrderId,
        side: request.side,
        type: request.type,
        amount: request.amount,
        price: request.price,
        executionTimeMs: result?.latencyMs,
        executedViaVPS: !!vpsIp,
        vpsIp: vpsIp || null
      }, result?.success ? 'success' : 'error');

      if (result?.success) {
        await this.updatePosition(order as Order, request.amount, result.executedPrice);
      }

      return order.id;
    } catch (error: any) {
      // Mark order as rejected
      await supabase
        .from('orders')
        .update({
          status: 'rejected',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      await this.logTransaction('order_placed', request.exchangeName, request.symbol, {
        orderId: order.id,
        clientOrderId,
        side: request.side,
        type: request.type,
        amount: request.amount,
        price: request.price
      }, 'error', error.message);

      throw error;
    }
  }

  private async executeViaVPS(
    vpsIp: string, 
    request: OrderRequest, 
    clientOrderId: string
  ): Promise<{ success: boolean; orderId?: string; executedPrice?: number; latencyMs?: number; error?: string }> {
    // Get exchange credentials
    const { data: exchange } = await supabase
      .from('exchange_connections')
      .select('api_key, api_secret, api_passphrase')
      .eq('exchange_name', request.exchangeName)
      .eq('is_connected', true)
      .single();

    if (!exchange) {
      throw new Error(`Exchange ${request.exchangeName} not connected`);
    }

    // Call VPS order endpoint directly for lowest latency
    const response = await fetch(`http://${vpsIp}:8080/place-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exchange: request.exchangeName,
        symbol: request.symbol,
        side: request.side,
        quantity: request.amount,
        orderType: request.type,
        price: request.price,
        apiKey: exchange.api_key,
        apiSecret: exchange.api_secret,
        passphrase: exchange.api_passphrase,
      }),
    });

    if (!response.ok) {
      throw new Error(`VPS returned ${response.status}`);
    }

    return await response.json();
  }

  private async executeViaEdgeFunction(
    request: OrderRequest, 
    clientOrderId: string, 
    idempotencyKey: string
  ): Promise<{ success: boolean; orderId?: string; executedPrice?: number; latencyMs?: number; error?: string }> {
    const { data: result, error: execError } = await supabase.functions.invoke('trade-engine', {
      body: {
        action: 'place-order',
        exchangeName: request.exchangeName,
        symbol: request.symbol,
        side: request.side,
        quantity: request.amount,
        price: request.price,
        clientOrderId,
        idempotencyKey
      }
    });

    if (execError) throw execError;
    return result;
  }

  async cancelOrder(orderId: string): Promise<void> {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error || !order) throw new Error('Order not found');
    if (order.status === 'filled' || order.status === 'cancelled') {
      throw new Error(`Cannot cancel order with status: ${order.status}`);
    }

    // Cancel via edge function if it has an exchange order ID
    if (order.exchange_order_id) {
      await supabase.functions.invoke('trade-engine', {
        body: {
          action: 'cancel-order',
          exchangeName: order.exchange_name,
          orderId: order.exchange_order_id
        }
      });
    }

    // Update order status
    await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    // Clear monitoring if active
    const timeout = this.pendingOrders.get(orderId);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingOrders.delete(orderId);
    }

    await this.logTransaction('order_cancelled', order.exchange_name, order.symbol, {
      orderId,
      originalStatus: order.status
    }, 'success');
  }

  async getOrders(exchangeName?: string, status?: string): Promise<Order[]> {
    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (exchangeName) {
      query = query.eq('exchange_name', exchangeName);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.limit(100);
    if (error) throw error;
    return (data || []) as Order[];
  }

  async getPositions(exchangeName?: string, includesClosed = false): Promise<any[]> {
    let query = supabase
      .from('positions')
      .select('*')
      .order('created_at', { ascending: false });

    if (exchangeName) {
      query = query.eq('exchange_name', exchangeName);
    }
    
    // By default, only show open positions
    if (!includesClosed) {
      query = query.or('status.eq.open,status.is.null');
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  private async updatePosition(order: Order, filledAmount: number, fillPrice: number): Promise<void> {
    const side = order.side === 'buy' ? 'long' : 'short';

    // Check for existing position
    const { data: existing } = await supabase
      .from('positions')
      .select('*')
      .eq('exchange_name', order.exchange_name)
      .eq('symbol', order.symbol)
      .eq('side', side)
      .single();

    if (existing) {
      // Update existing position
      const currentSize = parseFloat(existing.size) || 0;
      const currentEntryPrice = parseFloat(existing.entry_price) || 0;
      const newSize = currentSize + filledAmount;
      const newEntryPrice = (currentEntryPrice * currentSize + fillPrice * filledAmount) / newSize;

      await supabase
        .from('positions')
        .update({
          size: newSize,
          entry_price: newEntryPrice,
          current_price: fillPrice,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      // Create new position
      await supabase
        .from('positions')
        .insert({
          exchange_name: order.exchange_name,
          symbol: order.symbol,
          side,
          size: filledAmount,
          entry_price: fillPrice,
          current_price: fillPrice
        });
    }
  }

  async closePosition(positionId: string): Promise<void> {
    const { data: position, error } = await supabase
      .from('positions')
      .select('*')
      .eq('id', positionId)
      .single();

    if (error || !position) throw new Error('Position not found');

    // Mark position as closing
    await supabase
      .from('positions')
      .update({ status: 'closing', updated_at: new Date().toISOString() })
      .eq('id', positionId);

    // Place closing order
    const closeSide = position.side === 'long' ? 'sell' : 'buy';
    await this.placeOrder({
      exchangeName: position.exchange_name,
      symbol: position.symbol,
      side: closeSide,
      type: 'market',
      amount: parseFloat(position.size)
    });

    // Calculate realized PnL
    const entryPrice = parseFloat(position.entry_price);
    const currentPrice = parseFloat(position.current_price) || entryPrice;
    const size = parseFloat(position.size);
    const pnl = position.side === 'long' 
      ? (currentPrice - entryPrice) * size
      : (entryPrice - currentPrice) * size;

    // Log to trading_journal for historical record
    await supabase.from('trading_journal').insert({
      exchange: position.exchange_name,
      symbol: position.symbol,
      side: position.side,
      quantity: size,
      entry_price: entryPrice,
      exit_price: currentPrice,
      pnl: pnl,
      status: 'closed',
      closed_at: new Date().toISOString(),
      ai_reasoning: `Position closed via OrderManager. PnL: $${pnl.toFixed(2)}`
    });

    // Mark position as closed (keep for audit trail instead of delete)
    await supabase
      .from('positions')
      .update({ 
        status: 'closed', 
        realized_pnl: pnl,
        updated_at: new Date().toISOString() 
      })
      .eq('id', positionId);

    await this.logTransaction('position_closed', position.exchange_name, position.symbol, {
      positionId,
      side: position.side,
      size,
      entryPrice,
      exitPrice: currentPrice,
      realizedPnl: pnl
    }, 'success');
  }

  private async logTransaction(
    actionType: string,
    exchangeName: string,
    symbol: string,
    details: Record<string, any>,
    status: string,
    errorMessage?: string
  ): Promise<void> {
    await supabase.from('transaction_log').insert({
      action_type: actionType,
      exchange_name: exchangeName,
      symbol,
      details,
      status,
      error_message: errorMessage
    });
  }
}

export const orderManager = OrderManager.getInstance();