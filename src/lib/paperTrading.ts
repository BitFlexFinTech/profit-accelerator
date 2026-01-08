import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

interface PaperOrderRequest {
  exchangeName: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  amount: number;
  price?: number;
  strategyId?: string;
  leverage?: number;
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
  private initializingExchanges = new Set<string>();

  static getInstance(): PaperTradingManager {
    if (!PaperTradingManager.instance) {
      PaperTradingManager.instance = new PaperTradingManager();
    }
    return PaperTradingManager.instance;
  }

  /**
   * Initialize paper account with default balance if not already initialized
   */
  async initializePaperAccount(exchangeName: string): Promise<void> {
    // Prevent concurrent initialization for the same exchange
    if (this.initializingExchanges.has(exchangeName)) {
      return;
    }

    this.initializingExchanges.add(exchangeName);

    try {
      // Check if already initialized
      const { data: existing } = await supabase
        .from('paper_balance_history')
        .select('id')
        .eq('exchange_name', exchangeName)
        .limit(1)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from('paper_balance_history').insert({
          exchange_name: exchangeName,
          total_equity: this.initialBalance,
          breakdown: { 
            initial: true, 
            timestamp: new Date().toISOString(),
            startingBalance: this.initialBalance
          }
        });

        if (error) {
          console.error(`[PaperTrading] Init error for ${exchangeName}:`, error);
        } else {
          console.log(`[PaperTrading] Initialized ${exchangeName} with $${this.initialBalance}`);
        }
      }
    } finally {
      this.initializingExchanges.delete(exchangeName);
    }
  }

  async executePaperOrder(request: PaperOrderRequest): Promise<string> {
    // Ensure paper account is initialized
    await this.initializePaperAccount(request.exchangeName);

    // Get current market price from trade-engine (REAL-TIME PRICES)
    const { data: priceData } = await supabase.functions.invoke('trade-engine', {
      body: { action: 'get-prices' }
    });

    const baseSymbol = request.symbol.replace('USDT', '').replace('/USDT', '');
    const marketPrice = priceData?.prices?.[baseSymbol]?.price || request.price || 0;

    if (!marketPrice) {
      throw new Error(`Unable to fetch real-time price for ${request.symbol}`);
    }

    // Calculate fill price with simulated slippage
    const fillPrice = this.calculateFillPrice(request, marketPrice);

    // Simulate network latency
    const fillDelay = this.simulateNetworkLatency();
    await new Promise(resolve => setTimeout(resolve, fillDelay));

    // Check paper balance
    const paperBalance = await this.getPaperBalance(request.exchangeName);
    const leverage = request.leverage || 1;
    const orderValue = (fillPrice * request.amount) / leverage;

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
      fillPrice,
      leverage
    );

    // Update paper position
    await this.updatePaperPosition(request, fillPrice);

    // Update strategy daily progress if linked to a strategy
    if (request.strategyId) {
      await this.updateStrategyProgress(request.strategyId, request.side, request.amount, fillPrice);
    }

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
      .maybeSingle();

    // Auto-initialize if no balance exists
    if (!latestBalance) {
      await this.initializePaperAccount(exchangeName);
      return {
        total: this.initialBalance,
        available: this.initialBalance,
        inPositions: 0
      };
    }

    const total = latestBalance.total_equity || this.initialBalance;

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
    price: number,
    leverage: number = 1
  ): Promise<void> {
    const orderValue = (amount * price) / leverage;

    // Get current balance
    const currentBalance = await this.getPaperBalance(exchangeName);

    // Calculate new equity (simulated 0.1% fee)
    const fee = orderValue * 0.001;
    const newEquity = side === 'buy'
      ? currentBalance.total - fee
      : currentBalance.total - fee;

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
          value: orderValue,
          leverage,
          fee,
          timestamp: new Date().toISOString()
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
      .maybeSingle();

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

  private async updateStrategyProgress(
    strategyId: string,
    side: 'buy' | 'sell',
    amount: number,
    price: number
  ): Promise<void> {
    try {
      // Get current strategy
      const { data: strategy } = await supabase
        .from('trading_strategies')
        .select('trades_today, pnl_today, daily_progress')
        .eq('id', strategyId)
        .single();

      if (strategy) {
        // Increment trades count
        await supabase
          .from('trading_strategies')
          .update({
            trades_today: (strategy.trades_today || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', strategyId);
      }
    } catch (err) {
      console.error('[PaperTrading] Failed to update strategy progress:', err);
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

    // Get current price (REAL-TIME)
    const { data: priceData } = await supabase.functions.invoke('trade-engine', {
      body: { action: 'get-prices' }
    });

    const baseSymbol = position.symbol.replace('USDT', '').replace('/USDT', '');
    const currentPrice = priceData?.prices?.[baseSymbol]?.price || parseFloat(position.current_price?.toString() || '0');

    // Calculate PnL
    const entryPrice = parseFloat(position.entry_price?.toString() || '0');
    const size = parseFloat(position.size?.toString() || '0');
    const pnl = position.side === 'long' 
      ? (currentPrice - entryPrice) * size
      : (entryPrice - currentPrice) * size;

    // Place closing order
    const closeSide = position.side === 'long' ? 'sell' : 'buy';
    await this.executePaperOrder({
      exchangeName: position.exchange_name,
      symbol: position.symbol,
      side: closeSide,
      type: 'market',
      amount: size
    });

    // Delete position
    await supabase.from('paper_positions').delete().eq('id', positionId);

    console.log(`[PaperTrading] Closed position with PnL: $${pnl.toFixed(2)}`);
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
      breakdown: { 
        initial: true,
        reset: true,
        timestamp: new Date().toISOString()
      }
    });

    console.log(`[PaperTrading] Reset ${exchangeName} to $${this.initialBalance}`);
  }

  getInitialBalance(): number {
    return this.initialBalance;
  }
}

export const paperTradingManager = PaperTradingManager.getInstance();