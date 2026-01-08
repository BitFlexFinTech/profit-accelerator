import * as ccxt from 'ccxt';
import { supabase } from '@/integrations/supabase/client';

export interface ExchangeBalance {
  exchange: string;
  total: number;
  assets: Record<string, { total: number; valueUSDT: number; priceUSDT: number }>;
  timestamp: number;
}

type ExchangeInstance = InstanceType<typeof ccxt.Exchange>;

class ExchangeClientManager {
  private clients = new Map<string, ExchangeInstance>();

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
      });

      await client.loadMarkets();
      this.clients.set(connection.id, client);

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

      const [balance, tickers] = await Promise.all([
        client.fetchBalance(),
        client.fetchTickers().catch(() => ({})),
      ]);

      const prices: Record<string, number> = { USDT: 1, USD: 1, BUSD: 1, USDC: 1 };

      for (const [symbol, ticker] of Object.entries(tickers)) {
        const base = symbol.split('/')[0];
        if ((ticker as any).last) {
          prices[base] = (ticker as any).last;
        }
      }

      let total = 0;
      const assets: Record<string, { total: number; valueUSDT: number; priceUSDT: number }> = {};

      for (const [symbol, amount] of Object.entries(balance.total)) {
        if (typeof amount === 'number' && amount > 0) {
          const price = prices[symbol] || 0;
          const valueUSDT = amount * price;
          total += valueUSDT;
          assets[symbol] = { total: amount, priceUSDT: price, valueUSDT };
        }
      }

      return {
        exchange: client.name,
        total,
        assets,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('[ExchangeClient] fetchBalance error:', error);
      return null;
    }
  }

  async testConnection(connectionId: string): Promise<boolean> {
    const balance = await this.fetchBalance(connectionId);
    return balance !== null;
  }

  clearClient(connectionId: string) {
    this.clients.delete(connectionId);
  }
}

export const exchangeClient = new ExchangeClientManager();
