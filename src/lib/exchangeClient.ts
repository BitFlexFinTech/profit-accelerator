import * as ccxt from 'ccxt';
import { supabase } from '@/integrations/supabase/client';
import { retryWithBackoff } from './errorHandler';

export interface ExchangeBalance {
  exchange: string;
  total: number;
  available: number;
  inOrders: number;
  assets: Record<string, { total: number; available: number; valueUSDT: number; priceUSDT: number }>;
  timestamp: number;
  status: 'connected' | 'disconnected' | 'error';
}

interface RateLimitState {
  remaining: number;
  resetAt: number;
  limit: number;
}

type ExchangeInstance = InstanceType<typeof ccxt.Exchange>;

class ExchangeClientManager {
  private clients = new Map<string, ExchangeInstance>();
  private connectionStatus = new Map<string, 'connected' | 'disconnected' | 'error'>();
  private lastSyncTime = new Map<string, number>();
  private rateLimitStates = new Map<string, RateLimitState>();
  private exchangeTimeOffsets = new Map<string, number>();

  private async waitForRateLimit(exchangeName: string): Promise<void> {
    const state = this.rateLimitStates.get(exchangeName);
    if (!state) return;

    const now = Date.now();
    if (state.remaining <= 0 && state.resetAt > now) {
      const waitTime = state.resetAt - now;
      console.log(`[ExchangeClient] Rate limit reached for ${exchangeName}, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      state.remaining = state.limit;
    }
  }

  private updateRateLimitState(exchangeName: string, headers?: any): void {
    if (!headers) return;

    const state = this.rateLimitStates.get(exchangeName) || {
      remaining: 100,
      resetAt: Date.now() + 60000,
      limit: 100
    };

    if (headers['x-ratelimit-remaining']) {
      state.remaining = parseInt(headers['x-ratelimit-remaining']);
    }
    if (headers['x-ratelimit-limit']) {
      state.limit = parseInt(headers['x-ratelimit-limit']);
    }
    if (headers['x-ratelimit-reset']) {
      state.resetAt = Date.now() + (parseInt(headers['x-ratelimit-reset']) * 1000);
    }

    this.rateLimitStates.set(exchangeName, state);
  }

  async initClient(connection: any): Promise<ExchangeInstance | null> {
    try {
      const exchangeName = connection.exchange_name?.toLowerCase();
      const ExchangeClass = (ccxt as any)[exchangeName];

      if (!ExchangeClass) {
        throw new Error(`Unsupported exchange: ${connection.exchange_name}`);
      }

      const client = new ExchangeClass({
        apiKey: connection.api_key,
        secret: connection.api_secret,
        password: connection.api_passphrase,
        enableRateLimit: true,
        timeout: 30000,
        options: { adjustForTimeDifference: true }
      });

      // Load markets and sync time
      await client.loadMarkets();

      try {
        const serverTime = await client.fetchTime();
        const localTime = Date.now();
        const offset = serverTime - localTime;
        this.exchangeTimeOffsets.set(exchangeName, offset);

        if (Math.abs(offset) > 5000) {
          console.warn(`[ExchangeClient] Time sync issue for ${exchangeName}: ${offset}ms difference`);
        }
      } catch (e) {
        console.warn(`[ExchangeClient] Time sync failed for ${exchangeName}:`, e);
      }

      // Initialize rate limit state
      this.rateLimitStates.set(exchangeName, {
        remaining: 100,
        resetAt: Date.now() + 60000,
        limit: 100
      });

      this.clients.set(connection.id, client);
      this.connectionStatus.set(exchangeName, 'connected');

      await supabase
        .from('exchange_connections')
        .update({
          is_connected: true,
          last_ping_at: new Date().toISOString(),
        })
        .eq('id', connection.id);

      return client;
    } catch (error: any) {
      console.error(`[ExchangeClient] Failed to init ${connection.exchange_name}:`, error.message);
      this.connectionStatus.set(connection.exchange_name?.toLowerCase(), 'error');

      await supabase
        .from('exchange_connections')
        .update({
          is_connected: false,
        })
        .eq('id', connection.id);

      return null;
    }
  }

  async fetchBalance(connectionId: string): Promise<ExchangeBalance | null> {
    try {
      let client = this.clients.get(connectionId);

      if (!client) {
        const { data: connection } = await supabase
          .from('exchange_connections')
          .select('*')
          .eq('id', connectionId)
          .single();

        if (!connection) return null;

        client = await this.initClient(connection);
        if (!client) return null;
      }

      const exchangeName = client.name?.toLowerCase() || 'unknown';

      // Wait for rate limit
      await this.waitForRateLimit(exchangeName);

      const [balance, tickers] = await Promise.all([
        retryWithBackoff(() => client!.fetchBalance(), 3),
        retryWithBackoff(() => client!.fetchTickers().catch(() => ({})), 3)
      ]);

      // Update rate limit state from response headers
      this.updateRateLimitState(exchangeName, (client as any).lastResponseHeaders);

      const prices: Record<string, number> = { USDT: 1, USD: 1, BUSD: 1, USDC: 1 };

      for (const [symbol, ticker] of Object.entries(tickers)) {
        const base = symbol.split('/')[0];
        if ((ticker as any).last) {
          prices[base] = (ticker as any).last;
        }
      }

      let total = 0;
      let available = 0;
      const assets: Record<string, { total: number; available: number; valueUSDT: number; priceUSDT: number }> = {};

      for (const [symbol, amount] of Object.entries(balance.total)) {
        if (typeof amount === 'number' && amount > 0) {
          const price = prices[symbol] || 0;
          const valueUSDT = amount * price;
          const freeAmount = (balance.free as any)[symbol] || 0;
          total += valueUSDT;
          available += freeAmount * price;
          assets[symbol] = { 
            total: amount, 
            available: freeAmount,
            priceUSDT: price, 
            valueUSDT 
          };
        }
      }

      this.lastSyncTime.set(exchangeName, Date.now());
      this.connectionStatus.set(exchangeName, 'connected');

      return {
        exchange: client.name || exchangeName,
        total,
        available,
        inOrders: total - available,
        assets,
        timestamp: Date.now(),
        status: 'connected'
      };
    } catch (error) {
      console.error('[ExchangeClient] fetchBalance error:', error);
      return null;
    }
  }

  async executeOrder(
    connectionId: string,
    symbol: string,
    side: 'buy' | 'sell',
    type: 'market' | 'limit',
    amount: number,
    price?: number,
    clientOrderId?: string
  ): Promise<any> {
    const client = this.clients.get(connectionId);
    if (!client) throw new Error('Exchange client not initialized');

    const exchangeName = client.name?.toLowerCase() || 'unknown';
    await this.waitForRateLimit(exchangeName);

    return retryWithBackoff(async () => {
      if (type === 'market') {
        return client.createMarketOrder(symbol, side, amount, undefined, {
          clientOrderId
        });
      } else {
        if (!price) throw new Error('Price required for limit orders');
        return client.createLimitOrder(symbol, side, amount, price, {
          clientOrderId
        });
      }
    }, 3);
  }

  async cancelOrder(connectionId: string, orderId: string, symbol?: string): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client) throw new Error('Exchange client not initialized');

    const exchangeName = client.name?.toLowerCase() || 'unknown';
    await this.waitForRateLimit(exchangeName);

    await retryWithBackoff(() => client.cancelOrder(orderId, symbol), 3);
  }

  async fetchOrderStatus(connectionId: string, orderId: string, symbol?: string): Promise<any> {
    const client = this.clients.get(connectionId);
    if (!client) throw new Error('Exchange client not initialized');

    const exchangeName = client.name?.toLowerCase() || 'unknown';
    await this.waitForRateLimit(exchangeName);

    return retryWithBackoff(() => client.fetchOrder(orderId, symbol), 3);
  }

  async fetchPositions(connectionId: string): Promise<any[]> {
    const client = this.clients.get(connectionId);
    if (!client) throw new Error('Exchange client not initialized');

    const exchangeName = client.name?.toLowerCase() || 'unknown';
    await this.waitForRateLimit(exchangeName);

    return retryWithBackoff(() => client.fetchPositions(), 3);
  }

  async testConnection(connectionId: string): Promise<boolean> {
    const balance = await this.fetchBalance(connectionId);
    return balance !== null;
  }

  getConnectionStatus(exchangeName: string): 'connected' | 'disconnected' | 'error' {
    return this.connectionStatus.get(exchangeName.toLowerCase()) || 'disconnected';
  }

  getLastSyncTime(exchangeName: string): number | null {
    return this.lastSyncTime.get(exchangeName.toLowerCase()) || null;
  }

  getTimeOffset(exchangeName: string): number {
    return this.exchangeTimeOffsets.get(exchangeName.toLowerCase()) || 0;
  }

  clearClient(connectionId: string) {
    this.clients.delete(connectionId);
  }
}

export const exchangeClient = new ExchangeClientManager();
