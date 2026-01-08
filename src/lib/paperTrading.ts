import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

interface PaperOrderRequest {
  exchangeName: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  amount: number;
  price?: number;
}

interface PaperOrder {
  id: string;
  exchange_name: string;
  symbol: string;
  side: string;
  type: string;
  amount: number;
  price: number | null;
  fill_price: number | null;
  filled_amount: number;
  status: string;
  created_at: string;
  filled_at: string | null;
}

interface PaperPosition {
  id: string;
  exchange_name: string;
  symbol: string;
  side: string;
  size: number;
  entry_price: number;
  current_price: number | null;
  unrealized_pnl: number;
  created_at: string;
  updated_at: string;
}

export class PaperTradingManager {
  private static instance: PaperTradingManager;
  private initialBalance = 10000; // Default paper trading balance

  static getInstance(): PaperTradingManager {
    if (!PaperTradingManager.instance) {
      PaperTradingManager.instance = new PaperTradingManager();
    }
    return PaperTradingManager.instance;
  }

  async executePaperOrder(request: PaperOrderRequest): Promise<string> {
    // Get current market price from trade-engine
    const { data: priceData } = await supabase.functions.invoke('trade-engine', {
      body: { action: 'get-prices' }
    });

    const baseSymbol = request.symbol.replace('USDT', '').replace('/USDT', '');
    const marketPrice = priceData?.prices?.[baseSymbol]?.price || request.price || 0;

    // Calculate fill price with simulated slippage
    const fillPrice = this.calculateFillPrice(request, marketPrice);

    // Simulate network latency
    const fillDelay = this.simulateNetworkLatency();
    await new Promise(resolve => setTimeout(resolve, fillDelay));

    // Check paper balance
    const paperBalance = await this.getPaperBalance(request.exchangeName);
    const orderValue = fillPrice * request.amount;

    if (request.side === 'buy' && paperBalance.available < orderValue) {
      throw new Error(`Insufficient paper balance. Available: $${paperBalance.available.toFixed(2)}, Required: $${orderValue.toFixed(2)}`);
    }

    // Insert paper order
    const { data: paperOrder, error } = await supabase
      .from('paper_orders')
      .insert({
        exchange_name: request.exchangeName,
        symbol: request.symbol,
        side: request.side,
        type: request.type,
        amount: request.amount,
        price: request.price || null,
        fill_price: fillPrice,
        filled_amount: request.amount,
        status: 'filled',
        filled_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create paper order: ${error.message}`);

    // Update paper balance
    await this.updatePaperBalance(
      request.exchangeName,
      request.symbol,
      request.side,
      request.amount,
      fillPrice
    );

    // Update paper position
    await this.updatePaperPosition(request, fillPrice);

    return paperOrder.id;
  }

  private calculateFillPrice(request: PaperOrderRequest, marketPrice: number): number {
    if (request.type === 'limit' && request.price) {
      // Limit order fills at limit price if market reaches it
      return request.price;
    }

    // Market order with simulated slippage (0.01% - 0.05%)
    const slippagePercent = 0.0001 + Math.random() * 0.0004;
    const slippageDirection = request.side === 'buy' ? 1 : -1;
    
    return marketPrice * (1 + slippageDirection * slippagePercent);
  }

  private simulateNetworkLatency(): number {
    // Simulate 50-200ms network latency
    return 50 + Math.random() * 150;
  }

  async getPaperBalance(exchangeName: string): Promise<{
    total: number;
    available: number;
    inPositions: number;
  }> {
    // Get latest paper balance
    const { data: latestBalance } = await supabase
      .from('paper_balance_history')
      .select('total_equity, breakdown')
      .eq('exchange_name', exchangeName)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const total = latestBalance?.total_equity || this.initialBalance;

    // Calculate value in positions
    const { data: positions } = await supabase
      .from('paper_positions')
      .select('size, entry_price')
      .eq('exchange_name', exchangeName);

    const inPositions = positions?.reduce((sum, p) => {
      return sum + (parseFloat(p.size?.toString() || '0') * parseFloat(p.entry_price?.toString() || '0'));
    }, 0) || 0;

    return {
      total,
      available: total - inPositions,
      inPositions
    };
  }

  private async updatePaperBalance(
    exchangeName: string,
    symbol: string,
    side: 'buy' | 'sell',
    amount: number,
    price: number
  ): Promise<void> {
    const orderValue = amount * price;

    // Get current balance
    const currentBalance = await this.getPaperBalance(exchangeName);

    // Calculate new equity
    const newEquity = side === 'buy'
      ? currentBalance.total - orderValue * 0.001 // Simulated 0.1% fee
      : currentBalance.total + orderValue * 0.999; // Simulated 0.1% fee

    // Insert balance history record
    await supabase.from('paper_balance_history').insert({
      exchange_name: exchangeName,
      total_equity: newEquity,
      breakdown: {
        lastTrade: {
          symbol,
          side,
          amount,
          price,
          value: orderValue
        }
      }
    });
  }

  private async updatePaperPosition(
    request: PaperOrderRequest,
    fillPrice: number
  ): Promise<void> {
    const side = request.side === 'buy' ? 'long' : 'short';

    // Check for existing position
    const { data: existing } = await supabase
      .from('paper_positions')
      .select('*')
      .eq('exchange_name', request.exchangeName)
      .eq('symbol', request.symbol)
      .eq('side', side)
      .single();

    if (existing) {
      // Update existing position
      const currentSize = parseFloat(existing.size?.toString() || '0');
      const currentEntryPrice = parseFloat(existing.entry_price?.toString() || '0');
      const newSize = currentSize + request.amount;
      const newEntryPrice = (currentEntryPrice * currentSize + fillPrice * request.amount) / newSize;

      await supabase
        .from('paper_positions')
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
        .from('paper_positions')
        .insert({
          exchange_name: request.exchangeName,
          symbol: request.symbol,
          side,
          size: request.amount,
          entry_price: fillPrice,
          current_price: fillPrice
        });
    }
  }

  async getPaperOrders(exchangeName?: string): Promise<PaperOrder[]> {
    let query = supabase
      .from('paper_orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (exchangeName) {
      query = query.eq('exchange_name', exchangeName);
    }

    const { data, error } = await query.limit(100);
    if (error) throw error;
    return (data || []) as PaperOrder[];
  }

  async getPaperPositions(exchangeName?: string): Promise<PaperPosition[]> {
    let query = supabase
      .from('paper_positions')
      .select('*')
      .order('created_at', { ascending: false });

    if (exchangeName) {
      query = query.eq('exchange_name', exchangeName);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as PaperPosition[];
  }

  async closePaperPosition(positionId: string): Promise<void> {
    const { data: position, error } = await supabase
      .from('paper_positions')
      .select('*')
      .eq('id', positionId)
      .single();

    if (error || !position) throw new Error('Paper position not found');

    // Get current price
    const { data: priceData } = await supabase.functions.invoke('trade-engine', {
      body: { action: 'get-prices' }
    });

    const baseSymbol = position.symbol.replace('USDT', '').replace('/USDT', '');
    const currentPrice = priceData?.prices?.[baseSymbol]?.price || parseFloat(position.current_price?.toString() || '0');

    // Place closing order
    const closeSide = position.side === 'long' ? 'sell' : 'buy';
    await this.executePaperOrder({
      exchangeName: position.exchange_name,
      symbol: position.symbol,
      side: closeSide,
      type: 'market',
      amount: parseFloat(position.size?.toString() || '0')
    });

    // Delete position
    await supabase.from('paper_positions').delete().eq('id', positionId);
  }

  async resetPaperAccount(exchangeName: string): Promise<void> {
    // Clear all paper orders
    await supabase
      .from('paper_orders')
      .delete()
      .eq('exchange_name', exchangeName);

    // Clear all paper positions
    await supabase
      .from('paper_positions')
      .delete()
      .eq('exchange_name', exchangeName);

    // Reset balance history
    await supabase
      .from('paper_balance_history')
      .delete()
      .eq('exchange_name', exchangeName);

    // Insert initial balance
    await supabase.from('paper_balance_history').insert({
      exchange_name: exchangeName,
      total_equity: this.initialBalance,
      breakdown: { initial: true }
    });
  }
}

export const paperTradingManager = PaperTradingManager.getInstance();
