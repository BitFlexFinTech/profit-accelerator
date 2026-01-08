import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, TrendingUp, TrendingDown, Loader2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store/useAppStore';
import { RiskManager } from '@/lib/riskManager';
import { OrderManager } from '@/lib/orderManager';
import { PaperTradingManager } from '@/lib/paperTrading';
import { toast } from 'sonner';
import { ActionButton } from '@/components/ui/ActionButton';
import { BUTTON_TOOLTIPS } from '@/config/buttonTooltips';

const POPULAR_PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT'];

interface ExchangeBalance {
  exchange_name: string;
  balance_usdt: number | null;
}

export function OrderForm() {
  const paperTradingMode = useAppStore(state => state.paperTradingMode);
  const [exchanges, setExchanges] = useState<string[]>([]);
  const [exchangeBalances, setExchangeBalances] = useState<Record<string, number>>({});
  const [exchange, setExchange] = useState('');
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [riskWarnings, setRiskWarnings] = useState<string[]>([]);
  const [riskError, setRiskError] = useState<string | null>(null);

  // Get available balance for selected exchange
  const availableBalance = useMemo(() => {
    if (!exchange) return 0;
    return exchangeBalances[exchange] || 0;
  }, [exchange, exchangeBalances]);

  // Fetch connected exchanges with balances (live or paper mode)
  useEffect(() => {
    const fetchExchanges = async () => {
      // Always fetch exchange names
      const { data: exchangeData } = await supabase
        .from('exchange_connections')
        .select('exchange_name, balance_usdt')
        .eq('is_connected', true);
      
      if (exchangeData && exchangeData.length > 0) {
        const names = exchangeData.map(e => e.exchange_name);
        setExchanges(names);
        setExchange(names[0]);

        if (paperTradingMode) {
          // Fetch paper balance from paper_balance_history
          const { data: paperData } = await supabase
            .from('paper_balance_history')
            .select('exchange_name, total_equity')
            .order('created_at', { ascending: false })
            .limit(10);
          
          const balances: Record<string, number> = {};
          // Default paper balance if none exists
          names.forEach(name => { balances[name] = 10000; });
          
          // Override with actual paper balances
          paperData?.forEach((p) => {
            if (names.includes(p.exchange_name)) {
              balances[p.exchange_name] = p.total_equity || 10000;
            }
          });
          setExchangeBalances(balances);
        } else {
          // Live mode: use real exchange balances
          const balances: Record<string, number> = {};
          exchangeData.forEach((e: ExchangeBalance) => {
            balances[e.exchange_name] = e.balance_usdt || 0;
          });
          setExchangeBalances(balances);
        }
      }
    };
    fetchExchanges();

    // Subscribe to balance updates
    const channel = supabase
      .channel('exchange-balance-updates')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: paperTradingMode ? 'paper_balance_history' : 'exchange_connections'
      }, () => {
        fetchExchanges(); // Refetch on update
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [paperTradingMode]);

  // Validate risk on amount/price change
  useEffect(() => {
    const validateRisk = async () => {
      if (!amount || !exchange) {
        setRiskWarnings([]);
        setRiskError(null);
        return;
      }

      const riskManager = RiskManager.getInstance();
      const result = await riskManager.validateOrder(
        exchange,
        symbol,
        side,
        parseFloat(amount),
        price ? parseFloat(price) : undefined
      );

      if (!result.allowed) {
        setRiskError(result.reason || 'Order blocked by risk limits');
        setRiskWarnings([]);
      } else {
        setRiskError(null);
        setRiskWarnings(result.warnings || []);
      }
    };

    const timeout = setTimeout(validateRisk, 300);
    return () => clearTimeout(timeout);
  }, [amount, price, exchange, symbol, side]);

  const handlePercentage = (percent: number) => {
    if (availableBalance <= 0) {
      toast.error('No balance available on this exchange');
      return;
    }
    const calculatedAmount = (availableBalance * percent / 100).toFixed(2);
    setAmount(calculatedAmount);
  };

  const handleSubmit = async () => {
    if (!exchange || !symbol || !amount) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (riskError) {
      toast.error(riskError);
      return;
    }

    setIsSubmitting(true);
    try {
      if (paperTradingMode) {
        await PaperTradingManager.getInstance().executePaperOrder({
          exchangeName: exchange,
          symbol,
          side,
          type: orderType,
          amount: parseFloat(amount),
          price: price ? parseFloat(price) : undefined
        });
        toast.success(`Paper ${side} order placed for ${amount} ${symbol}`);
      } else {
        await OrderManager.getInstance().placeOrder({
          exchangeName: exchange,
          symbol,
          side,
          type: orderType,
          amount: parseFloat(amount),
          price: price ? parseFloat(price) : undefined
        });
        toast.success(`${side.toUpperCase()} order placed for ${amount} ${symbol}`);
      }

      // Reset form
      setAmount('');
      setPrice('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to place order');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-primary" />
          Place Order
          {paperTradingMode && (
            <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">PAPER</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Exchange Selector */}
        <div className="space-y-1.5">
          <Label className="text-xs">Exchange</Label>
          <Select value={exchange} onValueChange={setExchange}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select exchange" />
            </SelectTrigger>
            <SelectContent>
              {exchanges.map(ex => (
                <SelectItem key={ex} value={ex}>{ex}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Symbol Input */}
        <div className="space-y-1.5">
          <Label className="text-xs">Symbol</Label>
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POPULAR_PAIRS.map(pair => (
                <SelectItem key={pair} value={pair}>{pair}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Side Toggle */}
        <div className="space-y-1.5">
          <Label className="text-xs">Side</Label>
          <ToggleGroup 
            type="single" 
            value={side} 
            onValueChange={(v) => v && setSide(v as 'buy' | 'sell')}
            className="w-full"
          >
            <ToggleGroupItem 
              value="buy" 
              className="flex-1 data-[state=on]:bg-success/20 data-[state=on]:text-success data-[state=on]:border-success/50"
            >
              <TrendingUp className="w-4 h-4 mr-1" />
              Buy
            </ToggleGroupItem>
            <ToggleGroupItem 
              value="sell" 
              className="flex-1 data-[state=on]:bg-destructive/20 data-[state=on]:text-destructive data-[state=on]:border-destructive/50"
            >
              <TrendingDown className="w-4 h-4 mr-1" />
              Sell
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Order Type */}
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <ToggleGroup 
            type="single" 
            value={orderType} 
            onValueChange={(v) => v && setOrderType(v as 'market' | 'limit')}
            className="w-full"
          >
            <ToggleGroupItem value="market" className="flex-1">Market</ToggleGroupItem>
            <ToggleGroupItem value="limit" className="flex-1">Limit</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Amount Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Amount (USDT)</Label>
            <span className={`text-xs ${paperTradingMode ? 'text-primary' : 'text-muted-foreground'}`}>
              {paperTradingMode ? '📝 Paper: ' : 'Available: '}${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="h-9"
          />
          <div className="flex gap-1">
            {[25, 50, 75, 100].map(pct => (
              <ActionButton
                key={pct}
                tooltip={BUTTON_TOOLTIPS[`amount${pct}` as keyof typeof BUTTON_TOOLTIPS]}
                variant="outline"
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={() => handlePercentage(pct)}
                disabled={availableBalance <= 0}
              >
                {pct}%
              </ActionButton>
            ))}
          </div>
        </div>

        {/* Price Input (for limit orders) */}
        {orderType === 'limit' && (
          <div className="space-y-1.5">
            <Label className="text-xs">Price</Label>
            <Input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="h-9"
            />
          </div>
        )}

        {/* Risk Warnings */}
        {riskWarnings.length > 0 && (
          <Alert className="border-warning/50 bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-xs text-warning">
              {riskWarnings.join('. ')}
            </AlertDescription>
          </Alert>
        )}

        {/* Risk Error */}
        {riskError && (
          <Alert className="border-destructive/50 bg-destructive/10">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-xs text-destructive">
              {riskError}
            </AlertDescription>
          </Alert>
        )}

        {/* Submit Button */}
        <ActionButton
          tooltip={side === 'buy' ? BUTTON_TOOLTIPS.buyOrder : BUTTON_TOOLTIPS.sellOrder}
          className={`w-full ${side === 'buy' ? 'bg-success hover:bg-success/90' : 'bg-destructive hover:bg-destructive/90'}`}
          onClick={handleSubmit}
          disabled={isSubmitting || !!riskError || !exchange || !amount}
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : side === 'buy' ? (
            <TrendingUp className="w-4 h-4 mr-2" />
          ) : (
            <TrendingDown className="w-4 h-4 mr-2" />
          )}
          {paperTradingMode ? 'Paper ' : ''}{side === 'buy' ? 'Buy' : 'Sell'} {symbol.split('/')[0]}
        </ActionButton>
      </CardContent>
    </Card>
  );
}
