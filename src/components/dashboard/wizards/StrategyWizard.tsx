import { useState } from 'react';
import { Wand2, TrendingUp, ArrowDownUp, Grid3x3, Zap, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StrategyWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const STRATEGY_TYPES = [
  {
    id: 'momentum',
    name: 'Momentum',
    icon: TrendingUp,
    description: 'Follow strong price movements and trends'
  },
  {
    id: 'mean_reversion',
    name: 'Mean Reversion',
    icon: ArrowDownUp,
    description: 'Trade price returns to historical average'
  },
  {
    id: 'grid',
    name: 'Grid Trading',
    icon: Grid3x3,
    description: 'Place orders at regular price intervals'
  },
  {
    id: 'scalping',
    name: 'Scalping',
    icon: Zap,
    description: 'Quick trades capturing small price changes'
  }
];

export function StrategyWizard({ open, onOpenChange, onCreated }: StrategyWizardProps) {
  const [step, setStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [strategyType, setStrategyType] = useState('momentum');
  const [leverage, setLeverage] = useState(1);
  const [tradingMode, setTradingMode] = useState<'spot' | 'futures'>('spot');

  const resetForm = () => {
    setStep(1);
    setName('');
    setDescription('');
    setStrategyType('momentum');
    setLeverage(1);
    setTradingMode('spot');
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Please enter a strategy name');
      return;
    }

    setIsCreating(true);
    try {
      const { error } = await supabase
        .from('trading_strategies')
        .insert({
          name: name.trim(),
          description: description.trim() || `${STRATEGY_TYPES.find(t => t.id === strategyType)?.name} strategy`,
          trading_mode: tradingMode,
          leverage: tradingMode === 'futures' ? leverage : 1,
          is_active: false,
          is_paused: true,
          pnl_today: 0,
          trades_today: 0,
          win_rate: 0
        });

      if (error) throw error;

      toast.success('Strategy created successfully');
      handleClose();
      onCreated();
    } catch (error) {
      console.error('Failed to create strategy:', error);
      toast.error('Failed to create strategy');
    } finally {
      setIsCreating(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1: return name.trim().length > 0;
      case 2: return true;
      case 3: return true;
      default: return false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            Create New Strategy
          </DialogTitle>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 py-2">
          {[1, 2, 3, 4].map(s => (
            <div
              key={s}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                s === step ? 'bg-primary' : s < step ? 'bg-primary/50' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Name & Description */}
        {step === 1 && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Strategy Name</Label>
              <Input
                id="name"
                placeholder="e.g., BTC Momentum Alpha"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="Describe your strategy..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}

        {/* Step 2: Strategy Type */}
        {step === 2 && (
          <div className="py-4">
            <Label className="mb-3 block">Select Strategy Type</Label>
            <RadioGroup value={strategyType} onValueChange={setStrategyType} className="space-y-2">
              {STRATEGY_TYPES.map(type => (
                <label
                  key={type.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    strategyType === type.id 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <RadioGroupItem value={type.id} id={type.id} />
                  <type.icon className={`w-5 h-5 ${strategyType === type.id ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{type.name}</div>
                    <div className="text-xs text-muted-foreground">{type.description}</div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>
        )}

        {/* Step 3: Trading Parameters */}
        {step === 3 && (
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <Label>Trading Mode</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={tradingMode === 'spot' ? 'default' : 'outline'}
                  className="justify-center"
                  onClick={() => setTradingMode('spot')}
                >
                  Spot
                </Button>
                <Button
                  type="button"
                  variant={tradingMode === 'futures' ? 'default' : 'outline'}
                  className="justify-center"
                  onClick={() => setTradingMode('futures')}
                >
                  Futures
                </Button>
              </div>
            </div>

            {tradingMode === 'futures' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Leverage</Label>
                  <span className="text-sm font-medium">{leverage}x</span>
                </div>
                <Slider
                  value={[leverage]}
                  onValueChange={(v) => setLeverage(v[0])}
                  min={1}
                  max={20}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  Higher leverage increases both potential profits and risks
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="py-4 space-y-4">
            <div className="p-4 rounded-lg bg-muted/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Name</span>
                <span className="font-medium">{name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Type</span>
                <span className="font-medium">{STRATEGY_TYPES.find(t => t.id === strategyType)?.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Mode</span>
                <span className="font-medium capitalize">{tradingMode}</span>
              </div>
              {tradingMode === 'futures' && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Leverage</span>
                  <span className="font-medium">{leverage}x</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              The strategy will be created in paused state. Start it from the dashboard when ready.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="ghost"
            onClick={() => step > 1 ? setStep(step - 1) : handleClose()}
          >
            {step === 1 ? (
              'Cancel'
            ) : (
              <>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </>
            )}
          </Button>
          
          {step < 4 ? (
            <Button 
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? 'Creating...' : (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  Create Strategy
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
