import { supabase } from '@/integrations/supabase/client';

interface RiskLimits {
  maxPositionSize: number;
  maxDailyLoss: number;
  maxDrawdown: number;
  maxSlippage: number;
  minBalance: number;
}

interface RiskValidationResult {
  allowed: boolean;
  reason?: string;
  warnings?: string[];
}

export class RiskManager {
  private static instance: RiskManager;
  private riskLimitsCache: RiskLimits | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute

  static getInstance(): RiskManager {
    if (!RiskManager.instance) {
      RiskManager.instance = new RiskManager();
    }
    return RiskManager.instance;
  }

  async validateOrder(
    exchangeName: string,
    symbol: string,
    side: 'buy' | 'sell',
    amount: number,
    price?: number
  ): Promise<RiskValidationResult> {
    const limits = await this.getRiskLimits();
    const warnings: string[] = [];

    // Check kill switch
    const { data: config } = await supabase
      .from('trading_config')
      .select('global_kill_switch_enabled')
      .single();

    if (config?.global_kill_switch_enabled) {
      return {
        allowed: false,
        reason: 'Global kill switch is enabled. Trading is suspended.'
      };
    }

    // Check position size
    const orderValue = price ? amount * price : amount;
    if (orderValue > limits.maxPositionSize) {
      return {
        allowed: false,
        reason: `Order value $${orderValue.toFixed(2)} exceeds max position size $${limits.maxPositionSize}`
      };
    }

    // Check daily loss limit
    const dailyLoss = await this.getDailyLoss();
    if (dailyLoss >= limits.maxDailyLoss) {
      return {
        allowed: false,
        reason: `Daily loss $${dailyLoss.toFixed(2)} has reached limit $${limits.maxDailyLoss}`
      };
    }

    // Warn if approaching daily loss limit
    if (dailyLoss >= limits.maxDailyLoss * 0.8) {
      warnings.push(`Warning: Daily loss at ${((dailyLoss / limits.maxDailyLoss) * 100).toFixed(0)}% of limit`);
    }

    // Check drawdown
    const drawdown = await this.getDrawdown();
    if (drawdown >= limits.maxDrawdown) {
      return {
        allowed: false,
        reason: `Current drawdown ${drawdown.toFixed(1)}% exceeds limit ${limits.maxDrawdown}%`
      };
    }

    // Warn if approaching drawdown limit
    if (drawdown >= limits.maxDrawdown * 0.7) {
      warnings.push(`Warning: Drawdown at ${drawdown.toFixed(1)}% (limit: ${limits.maxDrawdown}%)`);
    }

    // Check minimum balance
    const balance = await this.getCurrentBalance();
    if (balance !== null && balance < limits.minBalance) {
      return {
        allowed: false,
        reason: `Balance $${balance.toFixed(2)} is below minimum $${limits.minBalance}`
      };
    }

    // Check if sufficient balance for order
    if (side === 'buy' && balance !== null && orderValue > balance * 0.95) {
      warnings.push('Warning: Order uses more than 95% of available balance');
    }

    return {
      allowed: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  async getRiskLimits(): Promise<RiskLimits> {
    // Return cached if still valid
    if (this.riskLimitsCache && Date.now() < this.cacheExpiry) {
      return this.riskLimitsCache;
    }

    // Fetch from trading_config
    const { data: config } = await supabase
      .from('trading_config')
      .select('max_position_size, max_daily_drawdown_percent')
      .single();

    const limits: RiskLimits = {
      maxPositionSize: config?.max_position_size || 10000,
      maxDailyLoss: (config?.max_daily_drawdown_percent || 5) * 100, // Convert % to $
      maxDrawdown: config?.max_daily_drawdown_percent || 10,
      maxSlippage: 0.5,
      minBalance: 100
    };

    this.riskLimitsCache = limits;
    this.cacheExpiry = Date.now() + this.CACHE_TTL;

    return limits;
  }

  async updateRiskLimits(updates: Partial<RiskLimits>): Promise<void> {
    await supabase
      .from('trading_config')
      .update({
        max_position_size: updates.maxPositionSize,
        max_daily_drawdown_percent: updates.maxDrawdown,
        updated_at: new Date().toISOString()
      })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    // Clear cache
    this.riskLimitsCache = null;
  }

  private async getDailyLoss(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get today's closed trades
    const { data: trades } = await supabase
      .from('trading_journal')
      .select('pnl')
      .gte('closed_at', today.toISOString())
      .not('pnl', 'is', null);

    if (!trades || trades.length === 0) return 0;

    // Sum up losses (negative PnL)
    const totalLoss = trades.reduce((sum, t) => {
      const pnl = parseFloat(t.pnl?.toString() || '0');
      return sum + (pnl < 0 ? Math.abs(pnl) : 0);
    }, 0);

    return totalLoss;
  }

  private async getDrawdown(): Promise<number> {
    // Get balance history for drawdown calculation
    const { data: balances } = await supabase
      .from('balance_history')
      .select('total_balance')
      .order('snapshot_time', { ascending: false })
      .limit(100);

    if (!balances || balances.length < 2) return 0;

    // Find peak balance
    const balanceValues = balances.map(b => parseFloat(b.total_balance?.toString() || '0'));
    const peak = Math.max(...balanceValues);
    const current = balanceValues[0];

    if (peak <= 0) return 0;

    return ((peak - current) / peak) * 100;
  }

  private async getCurrentBalance(): Promise<number | null> {
    const { data } = await supabase
      .from('balance_history')
      .select('total_balance')
      .order('snapshot_time', { ascending: false })
      .limit(1)
      .single();

    return data ? parseFloat(data.total_balance?.toString() || '0') : null;
  }

  async getRiskMetrics(): Promise<{
    dailyLoss: number;
    drawdown: number;
    currentBalance: number | null;
    limits: RiskLimits;
    dailyLossPercent: number;
    drawdownPercent: number;
  }> {
    const [dailyLoss, drawdown, currentBalance, limits] = await Promise.all([
      this.getDailyLoss(),
      this.getDrawdown(),
      this.getCurrentBalance(),
      this.getRiskLimits()
    ]);

    return {
      dailyLoss,
      drawdown,
      currentBalance,
      limits,
      dailyLossPercent: limits.maxDailyLoss > 0 ? (dailyLoss / limits.maxDailyLoss) * 100 : 0,
      drawdownPercent: limits.maxDrawdown > 0 ? (drawdown / limits.maxDrawdown) * 100 : 0
    };
  }
}

export const riskManager = RiskManager.getInstance();
