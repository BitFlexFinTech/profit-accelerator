import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BacktestRequest {
  strategy: string;
  symbol: string;
  startDate: string;
  endDate: string;
  initialBalance: number;
}

interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Fetch historical klines from Binance
async function fetchHistoricalData(symbol: string, startDate: string, endDate: string): Promise<OHLCV[]> {
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime();
  const formattedSymbol = symbol.replace('/', '');
  
  const klines: OHLCV[] = [];
  let currentStart = startTime;
  
  // Fetch in chunks (Binance limit is 1000 klines per request)
  while (currentStart < endTime) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${formattedSymbol}&interval=1h&startTime=${currentStart}&endTime=${endTime}&limit=1000`;
    
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

// Simple Momentum Strategy
function runMomentumStrategy(klines: OHLCV[], initialBalance: number): {
  trades: { entry: number; exit: number; pnl: number; side: 'long' | 'short' }[];
  finalBalance: number;
  maxDrawdown: number;
} {
  const trades: { entry: number; exit: number; pnl: number; side: 'long' | 'short' }[] = [];
  let balance = initialBalance;
  let peak = initialBalance;
  let maxDrawdown = 0;
  let position: { side: 'long' | 'short'; entry: number; size: number } | null = null;
  
  // Use 20-period momentum
  const lookback = 20;
  
  for (let i = lookback; i < klines.length; i++) {
    const current = klines[i];
    const past = klines[i - lookback];
    const momentum = (current.close - past.close) / past.close;
    
    // Update max drawdown
    if (balance > peak) peak = balance;
    const drawdown = ((peak - balance) / peak) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    
    if (!position) {
      // Enter position based on momentum
      if (momentum > 0.02) {
        // Strong upward momentum - go long
        const size = (balance * 0.1) / current.close; // Use 10% of balance
        position = { side: 'long', entry: current.close, size };
      } else if (momentum < -0.02) {
        // Strong downward momentum - go short
        const size = (balance * 0.1) / current.close;
        position = { side: 'short', entry: current.close, size };
      }
    } else {
      // Check exit conditions
      const priceChange = (current.close - position.entry) / position.entry;
      const pnl = position.side === 'long' 
        ? priceChange * position.size * position.entry
        : -priceChange * position.size * position.entry;
      
      // Take profit at 2% or stop loss at 1%
      const shouldExit = 
        (position.side === 'long' && (priceChange >= 0.02 || priceChange <= -0.01)) ||
        (position.side === 'short' && (priceChange <= -0.02 || priceChange >= 0.01));
      
      if (shouldExit) {
        balance += pnl;
        trades.push({
          entry: position.entry,
          exit: current.close,
          pnl,
          side: position.side,
        });
        position = null;
      }
    }
  }
  
  return { trades, finalBalance: balance, maxDrawdown };
}

// Simple Mean Reversion Strategy
function runMeanReversionStrategy(klines: OHLCV[], initialBalance: number): {
  trades: { entry: number; exit: number; pnl: number; side: 'long' | 'short' }[];
  finalBalance: number;
  maxDrawdown: number;
} {
  const trades: { entry: number; exit: number; pnl: number; side: 'long' | 'short' }[] = [];
  let balance = initialBalance;
  let peak = initialBalance;
  let maxDrawdown = 0;
  let position: { side: 'long' | 'short'; entry: number; size: number } | null = null;
  
  // Use 50-period SMA
  const lookback = 50;
  
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
    
    if (!position) {
      if (deviation < -0.03) {
        // Price below SMA - expect reversion up, go long
        const size = (balance * 0.1) / current.close;
        position = { side: 'long', entry: current.close, size };
      } else if (deviation > 0.03) {
        // Price above SMA - expect reversion down, go short
        const size = (balance * 0.1) / current.close;
        position = { side: 'short', entry: current.close, size };
      }
    } else {
      const priceChange = (current.close - position.entry) / position.entry;
      const pnl = position.side === 'long'
        ? priceChange * position.size * position.entry
        : -priceChange * position.size * position.entry;
      
      // Exit when price reverts to mean or stop loss
      const shouldExit = 
        Math.abs(deviation) < 0.01 || // Reverted to mean
        (position.side === 'long' && priceChange <= -0.02) || // Stop loss
        (position.side === 'short' && priceChange >= 0.02);
      
      if (shouldExit) {
        balance += pnl;
        trades.push({
          entry: position.entry,
          exit: current.close,
          pnl,
          side: position.side,
        });
        position = null;
      }
    }
  }
  
  return { trades, finalBalance: balance, maxDrawdown };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { backtestId, strategy, symbol, startDate, endDate, initialBalance } = await req.json();
    
    console.log(`[backtest] Starting backtest: ${strategy} on ${symbol} from ${startDate} to ${endDate}`);
    
    // Fetch historical data
    const klines = await fetchHistoricalData(symbol, startDate, endDate);
    
    if (klines.length < 100) {
      return new Response(
        JSON.stringify({ success: false, error: 'Not enough historical data available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[backtest] Fetched ${klines.length} klines`);
    
    // Run strategy
    let result;
    if (strategy.toLowerCase().includes('momentum')) {
      result = runMomentumStrategy(klines, initialBalance);
    } else {
      result = runMeanReversionStrategy(klines, initialBalance);
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
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
    
    console.log(`[backtest] Results: PnL=$${totalPnl.toFixed(2)}, Trades=${totalTrades}, WinRate=${winRate.toFixed(1)}%`);
    
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
        },
        trades: result.trades.slice(-20), // Return last 20 trades for display
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
