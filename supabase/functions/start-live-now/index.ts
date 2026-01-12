import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * START-LIVE-NOW: Immediate Trade Orchestrator
 * 
 * This function guarantees: Click Start → Immediate SPOT LONG trade attempt
 * 
 * Flow:
 * 1. Run preflight checks (VPS + Exchange connectivity)
 * 2. If no fresh AI signal, trigger ai-analyze and wait up to 15s
 * 3. Start bot container if not running
 * 4. Place MARKET BUY order on BOTH Binance and OKX
 * 5. Record trade in trading_journal
 * 6. Return proof payload
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('[start-live-now] ========== IMMEDIATE TRADE ORCHESTRATOR ==========');

  const result = {
    success: false,
    orderAttempted: false,
    orders: [] as Array<{
      exchange: string;
      symbol: string;
      side: string;
      quantity: number;
      price: number;
      orderId: string | null;
      status: string;
      error: string | null;
    }>,
    signalUsed: null as any,
    balanceSnapshot: {} as Record<string, number>,
    vpsIp: null as string | null,
    botStarted: false,
    blockingReason: null as string | null,
    timestamp: new Date().toISOString(),
  };

  try {
    // ========== STEP 1: PREFLIGHT - VPS CHECK ==========
    console.log('[start-live-now] Step 1: VPS preflight check...');
    
    const { data: deployment } = await supabase
      .from('hft_deployments')
      .select('id, server_id, ip_address, status, provider')
      .in('status', ['active', 'running'])
      .limit(1)
      .single();

    if (!deployment?.ip_address) {
      result.blockingReason = 'No active VPS deployment with IP address';
      console.log('[start-live-now] BLOCKED:', result.blockingReason);
      return new Response(JSON.stringify(result), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    result.vpsIp = deployment.ip_address;
    console.log(`[start-live-now] VPS found: ${deployment.ip_address}`);

    // Test VPS reachability
    let vpsReachable = false;
    try {
      const healthResp = await fetch(`http://${deployment.ip_address}/health`, {
        signal: AbortSignal.timeout(8000),
      });
      if (healthResp.ok) {
        vpsReachable = true;
        console.log('[start-live-now] VPS is reachable');
      }
    } catch (e) {
      result.blockingReason = `VPS at ${deployment.ip_address} is not responding`;
      console.log('[start-live-now] BLOCKED:', result.blockingReason);
      return new Response(JSON.stringify(result), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // ========== STEP 2: GET EXCHANGE CREDENTIALS ==========
    console.log('[start-live-now] Step 2: Fetching exchange credentials...');
    
    const { data: exchanges } = await supabase
      .from('exchange_connections')
      .select('exchange_name, api_key, api_secret, api_passphrase, balance_usdt')
      .eq('is_connected', true);

    if (!exchanges || exchanges.length === 0) {
      result.blockingReason = 'No connected exchanges found';
      console.log('[start-live-now] BLOCKED:', result.blockingReason);
      return new Response(JSON.stringify(result), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Filter to Binance and OKX only (per user requirement)
    const tradableExchanges = exchanges.filter(e => 
      ['binance', 'okx'].includes(e.exchange_name.toLowerCase()) &&
      e.api_key && e.api_secret
    );

    if (tradableExchanges.length === 0) {
      result.blockingReason = 'No Binance or OKX exchanges with credentials';
      console.log('[start-live-now] BLOCKED:', result.blockingReason);
      return new Response(JSON.stringify(result), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    console.log(`[start-live-now] Found ${tradableExchanges.length} tradable exchange(s)`);

    // ========== STEP 3: GET AI SIGNAL (or trigger scan) ==========
    console.log('[start-live-now] Step 3: Checking for AI signals...');
    
    // 5-minute window for signals (as approved)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    let { data: signals } = await supabase
      .from('ai_market_updates')
      .select('id, symbol, exchange_name, confidence, recommended_side, current_price, expected_move_percent, created_at')
      .gte('confidence', 70)
      .gte('created_at', fiveMinutesAgo)
      .in('recommended_side', ['long', 'buy']) // SPOT mode: LONG only
      .order('confidence', { ascending: false })
      .limit(5);

    // If no fresh signal, trigger AI scan and wait
    if (!signals || signals.length === 0) {
      console.log('[start-live-now] No fresh LONG signal. Triggering AI scan...');
      
      // Trigger ai-analyze
      try {
        await supabase.functions.invoke('ai-analyze', {
          body: { symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] }
        });
      } catch (e) {
        console.log('[start-live-now] AI scan trigger error (non-fatal):', e);
      }

      // Wait up to 15 seconds for a signal to appear
      const waitStart = Date.now();
      const maxWait = 15000;
      
      while (Date.now() - waitStart < maxWait) {
        await new Promise(r => setTimeout(r, 2000)); // Check every 2s
        
        const freshCheck = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: freshSignals } = await supabase
          .from('ai_market_updates')
          .select('id, symbol, exchange_name, confidence, recommended_side, current_price, expected_move_percent, created_at')
          .gte('confidence', 70)
          .gte('created_at', freshCheck)
          .in('recommended_side', ['long', 'buy'])
          .order('confidence', { ascending: false })
          .limit(5);

        if (freshSignals && freshSignals.length > 0) {
          signals = freshSignals;
          console.log(`[start-live-now] Fresh signal arrived after ${Date.now() - waitStart}ms`);
          break;
        }
      }
    }

    // Still no signal after waiting
    if (!signals || signals.length === 0) {
      result.blockingReason = 'No LONG AI signal available after 15s wait. Try again or check AI providers.';
      console.log('[start-live-now] BLOCKED:', result.blockingReason);
      return new Response(JSON.stringify(result), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const topSignal = signals[0];
    result.signalUsed = topSignal;
    console.log(`[start-live-now] Using signal: ${topSignal.symbol} ${topSignal.recommended_side} (${topSignal.confidence}%)`);

    // ========== STEP 4: GET TRADING CONFIG ==========
    console.log('[start-live-now] Step 4: Getting trading config...');
    
    const { data: config } = await supabase
      .from('trading_config')
      .select('max_position_size, leverage, trading_mode')
      .limit(1)
      .single();

    const maxPositionSize = config?.max_position_size || 350;
    console.log(`[start-live-now] Max position size: $${maxPositionSize}`);

    // Disable kill switch if enabled
    await supabase.from('trading_config')
      .update({ 
        global_kill_switch_enabled: false,
        bot_status: 'running',
        trading_enabled: true,
        updated_at: new Date().toISOString()
      })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    // ========== STEP 5: START BOT CONTAINER ==========
    console.log('[start-live-now] Step 5: Starting bot container...');
    
    try {
      const { data: startData, error: startError } = await supabase.functions.invoke('bot-control', {
        body: { action: 'start', deploymentId: deployment.id }
      });
      
      if (startError) {
        console.log('[start-live-now] Bot start warning:', startError.message);
      } else {
        result.botStarted = startData?.success || false;
        console.log('[start-live-now] Bot start result:', startData?.success ? 'SUCCESS' : 'PENDING');
      }
    } catch (e) {
      console.log('[start-live-now] Bot start error (non-fatal, may already be running)');
    }

    // ========== STEP 6: PLACE MARKET ORDERS ON BOTH EXCHANGES ==========
    console.log('[start-live-now] Step 6: Placing MARKET BUY orders...');
    result.orderAttempted = true;

    for (const exchange of tradableExchanges) {
      const exchangeName = exchange.exchange_name.toLowerCase();
      const orderResult = {
        exchange: exchangeName,
        symbol: topSignal.symbol,
        side: 'BUY',
        quantity: 0,
        price: 0,
        orderId: null as string | null,
        status: 'pending',
        error: null as string | null,
      };

      try {
        // Get current price from signal or fetch fresh
        let currentPrice = topSignal.current_price || 0;
        
        // If no price, try to get from VPS
        if (currentPrice <= 0) {
          try {
            const priceResp = await fetch(`http://${deployment.ip_address}/ticker`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                exchange: exchangeName, 
                symbol: topSignal.symbol 
              }),
              signal: AbortSignal.timeout(5000),
            });
            if (priceResp.ok) {
              const priceData = await priceResp.json();
              currentPrice = priceData.price || priceData.last || 0;
            }
          } catch {
            // Use fallback estimate
            if (topSignal.symbol.includes('BTC')) currentPrice = 100000;
            else if (topSignal.symbol.includes('ETH')) currentPrice = 3500;
            else currentPrice = 150;
          }
        }

        orderResult.price = currentPrice;

        // Calculate quantity based on max position size
        const quantity = currentPrice > 0 ? maxPositionSize / currentPrice : 0;
        orderResult.quantity = Math.floor(quantity * 100000) / 100000; // Round to 5 decimals

        if (orderResult.quantity <= 0) {
          orderResult.error = 'Calculated quantity is 0';
          orderResult.status = 'failed';
          result.orders.push(orderResult);
          continue;
        }

        console.log(`[start-live-now] Placing order on ${exchangeName}: ${topSignal.symbol} BUY ${orderResult.quantity} @ $${currentPrice}`);

        // Place order via VPS /place-order endpoint
        const orderResp = await fetch(`http://${deployment.ip_address}/place-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exchange: exchangeName,
            apiKey: exchange.api_key,
            apiSecret: exchange.api_secret,
            passphrase: exchange.api_passphrase || '',
            symbol: topSignal.symbol,
            side: 'buy',
            type: 'market',
            amount: orderResult.quantity,
          }),
          signal: AbortSignal.timeout(15000),
        });

        const orderData = await orderResp.json();
        console.log(`[start-live-now] ${exchangeName} order response:`, JSON.stringify(orderData));

        if (orderData.success || orderData.orderId || orderData.id) {
          orderResult.orderId = orderData.orderId || orderData.id || 'executed';
          orderResult.status = 'filled';
          result.success = true;

          // Record to trading_journal
          await supabase.from('trading_journal').insert({
            exchange: exchangeName,
            symbol: topSignal.symbol,
            side: 'long',
            entry_price: currentPrice,
            size: orderResult.quantity,
            ai_reasoning: `AI signal: ${topSignal.confidence}% confidence`,
            ai_provider: 'start-live-now',
            order_type: 'market',
            status: 'open',
            created_at: new Date().toISOString(),
          });

          console.log(`[start-live-now] ✅ Order SUCCESS on ${exchangeName}: ${orderResult.orderId}`);
        } else {
          orderResult.error = orderData.error || orderData.message || 'Order failed';
          orderResult.status = 'failed';
          console.log(`[start-live-now] ❌ Order FAILED on ${exchangeName}: ${orderResult.error}`);
        }

      } catch (orderErr) {
        orderResult.error = orderErr instanceof Error ? orderErr.message : 'Order timeout';
        orderResult.status = 'failed';
        console.log(`[start-live-now] ❌ Order ERROR on ${exchangeName}: ${orderResult.error}`);
      }

      result.orders.push(orderResult);
      
      // Store balance snapshot
      if (exchange.balance_usdt) {
        result.balanceSnapshot[exchangeName] = exchange.balance_usdt;
      }
    }

    // ========== FINAL RESULT ==========
    const successfulOrders = result.orders.filter(o => o.status === 'filled');
    result.success = successfulOrders.length > 0;

    if (result.success) {
      console.log(`[start-live-now] ✅ COMPLETE: ${successfulOrders.length} order(s) placed successfully`);
    } else {
      result.blockingReason = result.orders.map(o => `${o.exchange}: ${o.error}`).join('; ');
      console.log('[start-live-now] ❌ FAILED: All order attempts failed');
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[start-live-now] Fatal error:', error);
    result.blockingReason = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
