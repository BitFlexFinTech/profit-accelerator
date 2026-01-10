import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BacktestRequest {
  backtestId?: string;
  strategy: string;
  symbol: string;
  startDate: string;
  endDate: string;
  initialBalance: number;
  takeProfitPct?: number;
  stopLossPct?: number;
  feesPct?: number;
  slippagePct?: number;
  timeframe?: string;
}

interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Trade {
  entry: number;
  exit: number;
  pnl: number;
  side: 'long' | 'short';
  entryTime: number;
  exitTime: number;
  fees: number;
  slippage: number;
}

interface StrategyResult {
  trades: Trade[];
  finalBalance: number;
  maxDrawdown: number;
  equityCurve: { time: number; balance: number }[];
  totalFees: number;
  totalSlippage: number;
}

// Map timeframe to Binance interval
function getInterval(timeframe: string): string {
  const map: Record<string, string> = {
    '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w'
  };
  return map[timeframe] || '1h';
}

// Fetch historical klines from Binance
async function fetchHistoricalData(symbol: string, startDate: string, endDate: string, timeframe: string): Promise<OHLCV[]> {
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime();
  const formattedSymbol = symbol.replace('/', '');
  const interval = getInterval(timeframe);
  
  const klines: OHLCV[] = [];
  let currentStart = startTime;
  
  // Fetch in chunks (Binance limit is 1000 klines per request)
  while (currentStart < endTime) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&startTime=${currentStart}&endTime=${endTime}&limit=1000`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.log(`[backtest] Binance API error: ${response.status}`);
        break;
      }
      
      const data = await response.json();
      if (!data || data.length === 0) break;
      
      for (const k of data) {
        klines.push({
          time: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        });
      }
      
      // Move to next chunk
      currentStart = data[data.length - 1][0] + 1;
      
      // Limit total klines to prevent timeout
      if (klines.length >= 5000) break;
    } catch (err) {
      console.error('[backtest] Failed to fetch klines:', err);
      break;
    }
  }
  
  return klines;
}

// Apply fees and slippage to trade
function applyTradeCosts(
  price: number, 
  side: 'entry' | 'exit', 
  direction: 'long' | 'short',
  feesPct: number,
  slippagePct: number
): { adjustedPrice: number; fee: number; slippage: number } {
  // Slippage goes against the trader
  let slippageMultiplier = 1;
  if (side === 'entry') {
    slippageMultiplier = direction === 'long' ? (1 + slippagePct / 100) : (1 - slippagePct / 100);
  } else {
    slippageMultiplier = direction === 'long' ? (1 - slippagePct / 100) : (1 + slippagePct / 100);
  }
  
  const adjustedPrice = price * slippageMultiplier;
  const slippage = Math.abs(price - adjustedPrice);
  const fee = adjustedPrice * (feesPct / 100);
  
  return { adjustedPrice, fee, slippage };
}

// Momentum Strategy with configurable TP/SL and costs
function runMomentumStrategy(
  klines: OHLCV[], 
  initialBalance: number,
  takeProfitPct: number,
  stopLossPct: number,
  feesPct: number,
  slippagePct: number
): StrategyResult {
  const trades: Trade[] = [];
  let balance = initialBalance;
  let peak = initialBalance;
  let maxDrawdown = 0;
  let totalFees = 0;
  let totalSlippage = 0;
  const equityCurve: { time: number; balance: number }[] = [{ time: klines[0]?.time || 0, balance: initialBalance }];
  
  let position: { side: 'long' | 'short'; entry: number; size: number; entryTime: number } | null = null;
  
  const lookback = 20;
  const takeProfit = takeProfitPct / 100;
  const stopLoss = stopLossPct / 100;
  
  for (let i = lookback; i < klines.length; i++) {
    const current = klines[i];
    const past = klines[i - lookback];
    const momentum = (current.close - past.close) / past.close;
    
    // Update max drawdown
    if (balance > peak) peak = balance;
    const drawdown = ((peak - balance) / peak) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    
    // Record equity curve every 10 bars
    if (i % 10 === 0) {
      equityCurve.push({ time: current.time, balance });
    }
    
    if (!position) {
      // Enter position based on momentum
      if (momentum > 0.02) {
        const { adjustedPrice, fee, slippage } = applyTradeCosts(current.close, 'entry', 'long', feesPct, slippagePct);
        const size = ((balance - fee) * 0.1) / adjustedPrice;
        position = { side: 'long', entry: adjustedPrice, size, entryTime: current.time };
        balance -= fee;
        totalFees += fee;
        totalSlippage += slippage;
      } else if (momentum < -0.02) {
        const { adjustedPrice, fee, slippage } = applyTradeCosts(current.close, 'entry', 'short', feesPct, slippagePct);
        const size = ((balance - fee) * 0.1) / adjustedPrice;
        position = { side: 'short', entry: adjustedPrice, size, entryTime: current.time };
        balance -= fee;
        totalFees += fee;
        totalSlippage += slippage;
      }
    } else {
      const priceChange = (current.close - position.entry) / position.entry;
      
      // Check TP/SL conditions
      const shouldExit = 
        (position.side === 'long' && (priceChange >= takeProfit || priceChange <= -stopLoss)) ||
        (position.side === 'short' && (priceChange <= -takeProfit || priceChange >= stopLoss));
      
      if (shouldExit) {
        const { adjustedPrice, fee, slippage } = applyTradeCosts(current.close, 'exit', position.side, feesPct, slippagePct);
        
        const pnl = position.side === 'long' 
          ? (adjustedPrice - position.entry) * position.size
          : (position.entry - adjustedPrice) * position.size;
        
        balance += pnl - fee;
        totalFees += fee;
        totalSlippage += slippage;
        
        trades.push({
          entry: position.entry,
          exit: adjustedPrice,
          pnl: pnl - fee,
          side: position.side,
          entryTime: position.entryTime,
          exitTime: current.time,
          fees: fee,
          slippage
        });
        position = null;
      }
    }
  }
  
  // Add final equity point
  equityCurve.push({ time: klines[klines.length - 1]?.time || 0, balance });
  
  return { trades, finalBalance: balance, maxDrawdown, equityCurve, totalFees, totalSlippage };
}

// Mean Reversion Strategy with configurable TP/SL and costs
function runMeanReversionStrategy(
  klines: OHLCV[], 
  initialBalance: number,
  takeProfitPct: number,
  stopLossPct: number,
  feesPct: number,
  slippagePct: number
): StrategyResult {
  const trades: Trade[] = [];
  let balance = initialBalance;
  let peak = initialBalance;
  let maxDrawdown = 0;
  let totalFees = 0;
  let totalSlippage = 0;
  const equityCurve: { time: number; balance: number }[] = [{ time: klines[0]?.time || 0, balance: initialBalance }];
  
  let position: { side: 'long' | 'short'; entry: number; size: number; entryTime: number } | null = null;
  
  const lookback = 50;
  const takeProfit = takeProfitPct / 100;
  const stopLoss = stopLossPct / 100;
  
  for (let i = lookback; i < klines.length; i++) {
    const current = klines[i];
    
    // Calculate SMA
    let sum = 0;
    for (let j = i - lookback; j < i; j++) {
      sum += klines[j].close;
    }
    const sma = sum / lookback;
    const deviation = (current.close - sma) / sma;
    
    // Update max drawdown
    if (balance > peak) peak = balance;
    const drawdown = ((peak - balance) / peak) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    
    // Record equity curve every 10 bars
    if (i % 10 === 0) {
      equityCurve.push({ time: current.time, balance });
    }
    
    if (!position) {
      if (deviation < -0.03) {
        const { adjustedPrice, fee, slippage } = applyTradeCosts(current.close, 'entry', 'long', feesPct, slippagePct);
        const size = ((balance - fee) * 0.1) / adjustedPrice;
        position = { side: 'long', entry: adjustedPrice, size, entryTime: current.time };
        balance -= fee;
        totalFees += fee;
        totalSlippage += slippage;
      } else if (deviation > 0.03) {
        const { adjustedPrice, fee, slippage } = applyTradeCosts(current.close, 'entry', 'short', feesPct, slippagePct);
        const size = ((balance - fee) * 0.1) / adjustedPrice;
        position = { side: 'short', entry: adjustedPrice, size, entryTime: current.time };
        balance -= fee;
        totalFees += fee;
        totalSlippage += slippage;
      }
    } else {
      const priceChange = (current.close - position.entry) / position.entry;
      
      // Exit when price reverts to mean, hits TP, or hits SL
      const shouldExit = 
        Math.abs(deviation) < 0.01 || // Reverted to mean
        (position.side === 'long' && (priceChange >= takeProfit || priceChange <= -stopLoss)) ||
        (position.side === 'short' && (priceChange <= -takeProfit || priceChange >= stopLoss));
      
      if (shouldExit) {
        const { adjustedPrice, fee, slippage } = applyTradeCosts(current.close, 'exit', position.side, feesPct, slippagePct);
        
        const pnl = position.side === 'long'
          ? (adjustedPrice - position.entry) * position.size
          : (position.entry - adjustedPrice) * position.size;
        
        balance += pnl - fee;
        totalFees += fee;
        totalSlippage += slippage;
        
        trades.push({
          entry: position.entry,
          exit: adjustedPrice,
          pnl: pnl - fee,
          side: position.side,
          entryTime: position.entryTime,
          exitTime: current.time,
          fees: fee,
          slippage
        });
        position = null;
      }
    }
  }
  
  // Add final equity point
  equityCurve.push({ time: klines[klines.length - 1]?.time || 0, balance });
  
  return { trades, finalBalance: balance, maxDrawdown, equityCurve, totalFees, totalSlippage };
}

// RSI Strategy
function runRSIStrategy(
  klines: OHLCV[], 
  initialBalance: number,
  takeProfitPct: number,
  stopLossPct: number,
  feesPct: number,
  slippagePct: number
): StrategyResult {
  const trades: Trade[] = [];
  let balance = initialBalance;
  let peak = initialBalance;
  let maxDrawdown = 0;
  let totalFees = 0;
  let totalSlippage = 0;
  const equityCurve: { time: number; balance: number }[] = [{ time: klines[0]?.time || 0, balance: initialBalance }];
  
  let position: { side: 'long' | 'short'; entry: number; size: number; entryTime: number } | null = null;
  
  const rsiPeriod = 14;
  const takeProfit = takeProfitPct / 100;
  const stopLoss = stopLossPct / 100;
  
  // Calculate RSI
  function calculateRSI(prices: number[], period: number): number {
    if (prices.length < period + 1) return 50;
    
    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
  
  for (let i = rsiPeriod + 1; i < klines.length; i++) {
    const current = klines[i];
    const prices = klines.slice(0, i + 1).map(k => k.close);
    const rsi = calculateRSI(prices, rsiPeriod);
    
    // Update max drawdown
    if (balance > peak) peak = balance;
    const drawdown = ((peak - balance) / peak) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    
    if (i % 10 === 0) {
      equityCurve.push({ time: current.time, balance });
    }
    
    if (!position) {
      if (rsi < 30) { // Oversold - buy
        const { adjustedPrice, fee, slippage } = applyTradeCosts(current.close, 'entry', 'long', feesPct, slippagePct);
        const size = ((balance - fee) * 0.1) / adjustedPrice;
        position = { side: 'long', entry: adjustedPrice, size, entryTime: current.time };
        balance -= fee;
        totalFees += fee;
        totalSlippage += slippage;
      } else if (rsi > 70) { // Overbought - sell
        const { adjustedPrice, fee, slippage } = applyTradeCosts(current.close, 'entry', 'short', feesPct, slippagePct);
        const size = ((balance - fee) * 0.1) / adjustedPrice;
        position = { side: 'short', entry: adjustedPrice, size, entryTime: current.time };
        balance -= fee;
        totalFees += fee;
        totalSlippage += slippage;
      }
    } else {
      const priceChange = (current.close - position.entry) / position.entry;
      
      const shouldExit = 
        (position.side === 'long' && (rsi > 70 || priceChange >= takeProfit || priceChange <= -stopLoss)) ||
        (position.side === 'short' && (rsi < 30 || priceChange <= -takeProfit || priceChange >= stopLoss));
      
      if (shouldExit) {
        const { adjustedPrice, fee, slippage } = applyTradeCosts(current.close, 'exit', position.side, feesPct, slippagePct);
        
        const pnl = position.side === 'long'
          ? (adjustedPrice - position.entry) * position.size
          : (position.entry - adjustedPrice) * position.size;
        
        balance += pnl - fee;
        totalFees += fee;
        totalSlippage += slippage;
        
        trades.push({
          entry: position.entry,
          exit: adjustedPrice,
          pnl: pnl - fee,
          side: position.side,
          entryTime: position.entryTime,
          exitTime: current.time,
          fees: fee,
          slippage
        });
        position = null;
      }
    }
  }
  
  equityCurve.push({ time: klines[klines.length - 1]?.time || 0, balance });
  
  return { trades, finalBalance: balance, maxDrawdown, equityCurve, totalFees, totalSlippage };
}

// Bollinger Bands Strategy
function runBollingerStrategy(
  klines: OHLCV[], 
  initialBalance: number,
  takeProfitPct: number,
  stopLossPct: number,
  feesPct: number,
  slippagePct: number
): StrategyResult {
  const trades: Trade[] = [];
  let balance = initialBalance;
  let peak = initialBalance;
  let maxDrawdown = 0;
  let totalFees = 0;
  let totalSlippage = 0;
  const equityCurve: { time: number; balance: number }[] = [{ time: klines[0]?.time || 0, balance: initialBalance }];
  
  let position: { side: 'long' | 'short'; entry: number; size: number; entryTime: number } | null = null;
  
  const period = 20;
  const stdDevMultiplier = 2;
  const takeProfit = takeProfitPct / 100;
  const stopLoss = stopLossPct / 100;
  
  for (let i = period; i < klines.length; i++) {
    const current = klines[i];
    
    // Calculate Bollinger Bands
    const prices = klines.slice(i - period, i).map(k => k.close);
    const sma = prices.reduce((a, b) => a + b, 0) / period;
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    const upperBand = sma + stdDevMultiplier * stdDev;
    const lowerBand = sma - stdDevMultiplier * stdDev;
    
    // Update max drawdown
    if (balance > peak) peak = balance;
    const drawdown = ((peak - balance) / peak) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    
    if (i % 10 === 0) {
      equityCurve.push({ time: current.time, balance });
    }
    
    if (!position) {
      if (current.close < lowerBand) { // Price below lower band - buy
        const { adjustedPrice, fee, slippage } = applyTradeCosts(current.close, 'entry', 'long', feesPct, slippagePct);
        const size = ((balance - fee) * 0.1) / adjustedPrice;
        position = { side: 'long', entry: adjustedPrice, size, entryTime: current.time };
        balance -= fee;
        totalFees += fee;
        totalSlippage += slippage;
      } else if (current.close > upperBand) { // Price above upper band - sell
        const { adjustedPrice, fee, slippage } = applyTradeCosts(current.close, 'entry', 'short', feesPct, slippagePct);
        const size = ((balance - fee) * 0.1) / adjustedPrice;
        position = { side: 'short', entry: adjustedPrice, size, entryTime: current.time };
        balance -= fee;
        totalFees += fee;
        totalSlippage += slippage;
      }
    } else {
      const priceChange = (current.close - position.entry) / position.entry;
      
      // Exit when price returns to SMA or hits TP/SL
      const shouldExit = 
        (position.side === 'long' && (current.close >= sma || priceChange >= takeProfit || priceChange <= -stopLoss)) ||
        (position.side === 'short' && (current.close <= sma || priceChange <= -takeProfit || priceChange >= stopLoss));
      
      if (shouldExit) {
        const { adjustedPrice, fee, slippage } = applyTradeCosts(current.close, 'exit', position.side, feesPct, slippagePct);
        
        const pnl = position.side === 'long'
          ? (adjustedPrice - position.entry) * position.size
          : (position.entry - adjustedPrice) * position.size;
        
        balance += pnl - fee;
        totalFees += fee;
        totalSlippage += slippage;
        
        trades.push({
          entry: position.entry,
          exit: adjustedPrice,
          pnl: pnl - fee,
          side: position.side,
          entryTime: position.entryTime,
          exitTime: current.time,
          fees: fee,
          slippage
        });
        position = null;
      }
    }
  }
  
  equityCurve.push({ time: klines[klines.length - 1]?.time || 0, balance });
  
  return { trades, finalBalance: balance, maxDrawdown, equityCurve, totalFees, totalSlippage };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: BacktestRequest = await req.json();
    const { 
      backtestId, 
      strategy, 
      symbol, 
      startDate, 
      endDate, 
      initialBalance,
      takeProfitPct = 2.0,
      stopLossPct = 1.0,
      feesPct = 0.1,
      slippagePct = 0.05,
      timeframe = '1h'
    } = body;
    
    console.log(`[backtest] Starting: ${strategy} on ${symbol} (${timeframe}) from ${startDate} to ${endDate}`);
    console.log(`[backtest] Settings: TP=${takeProfitPct}%, SL=${stopLossPct}%, Fees=${feesPct}%, Slippage=${slippagePct}%`);
    
    // Fetch historical data
    const klines = await fetchHistoricalData(symbol, startDate, endDate, timeframe);
    
    if (klines.length < 100) {
      return new Response(
        JSON.stringify({ success: false, error: 'Not enough historical data available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[backtest] Fetched ${klines.length} klines`);
    
    // Run strategy based on selection
    let result: StrategyResult;
    const strategyLower = strategy.toLowerCase();
    
    if (strategyLower.includes('momentum')) {
      result = runMomentumStrategy(klines, initialBalance, takeProfitPct, stopLossPct, feesPct, slippagePct);
    } else if (strategyLower.includes('rsi')) {
      result = runRSIStrategy(klines, initialBalance, takeProfitPct, stopLossPct, feesPct, slippagePct);
    } else if (strategyLower.includes('bollinger')) {
      result = runBollingerStrategy(klines, initialBalance, takeProfitPct, stopLossPct, feesPct, slippagePct);
    } else {
      result = runMeanReversionStrategy(klines, initialBalance, takeProfitPct, stopLossPct, feesPct, slippagePct);
    }
    
    // Calculate metrics
    const totalPnl = result.finalBalance - initialBalance;
    const totalTrades = result.trades.length;
    const winningTrades = result.trades.filter(t => t.pnl > 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    
    // Calculate Sharpe Ratio (simplified)
    const returns = result.trades.map(t => t.pnl / initialBalance);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length || 1);
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
    
    console.log(`[backtest] Results: PnL=$${totalPnl.toFixed(2)}, Trades=${totalTrades}, WinRate=${winRate.toFixed(1)}%`);
    console.log(`[backtest] Costs: Fees=$${result.totalFees.toFixed(2)}, Slippage=$${result.totalSlippage.toFixed(2)}`);
    
    // Update backtest result in database
    if (backtestId) {
      await supabase
        .from('backtest_results')
        .update({
          total_pnl: Math.round(totalPnl * 100) / 100,
          total_trades: totalTrades,
          win_rate: Math.round(winRate * 10) / 10,
          max_drawdown: Math.round(result.maxDrawdown * 10) / 10,
          sharpe_ratio: Math.round(sharpeRatio * 100) / 100,
          fees_paid: Math.round(result.totalFees * 100) / 100,
          slippage_cost: Math.round(result.totalSlippage * 100) / 100,
          timeframe,
          take_profit_pct: takeProfitPct,
          stop_loss_pct: stopLossPct,
          initial_balance: initialBalance,
          final_balance: Math.round(result.finalBalance * 100) / 100,
          equity_curve: result.equityCurve,
        })
        .eq('id', backtestId);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        results: {
          totalPnl: Math.round(totalPnl * 100) / 100,
          totalTrades,
          winRate: Math.round(winRate * 10) / 10,
          maxDrawdown: Math.round(result.maxDrawdown * 10) / 10,
          sharpeRatio: Math.round(sharpeRatio * 100) / 100,
          finalBalance: Math.round(result.finalBalance * 100) / 100,
          totalFees: Math.round(result.totalFees * 100) / 100,
          totalSlippage: Math.round(result.totalSlippage * 100) / 100,
        },
        trades: result.trades.slice(-20),
        equityCurve: result.equityCurve,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[backtest] Error:', error);
    
    return new Response(
      JSON.stringify({ success: false, error }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});