import { useState } from 'react';
import { Copy, ArrowRight, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TradeCopierWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const connectedExchanges = ['Bybit', 'OKX', 'Bitget', 'BingX'];

type CopyMode = 'exact' | 'proportional' | 'fixed';

export function TradeCopierWizard({ open, onOpenChange }: TradeCopierWizardProps) {
  const [masterExchange, setMasterExchange] = useState('');
  const [mirrorExchanges, setMirrorExchanges] = useState<string[]>([]);
  const [copyMode, setCopyMode] = useState<CopyMode>('exact');
  const [fixedSize, setFixedSize] = useState('350');
  const [proportionalRatio, setProportionalRatio] = useState('1.0');
  const [step, setStep] = useState(1);

  const toggleMirror = (exchange: string) => {
    if (mirrorExchanges.includes(exchange)) {
      setMirrorExchanges(mirrorExchanges.filter(e => e !== exchange));
    } else {
      setMirrorExchanges([...mirrorExchanges, exchange]);
    }
  };

  const handleSave = () => {
    console.log({
      masterExchange,
      mirrorExchanges,
      copyMode,
      fixedSize: copyMode === 'fixed' ? fixedSize : null,
      proportionalRatio: copyMode === 'proportional' ? proportionalRatio : null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <Copy className="w-6 h-6 text-primary" />
            </div>
            <div>
              <DialogTitle>Trade Copier Setup</DialogTitle>
              <p className="text-sm text-muted-foreground">Step {step} of 3</p>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-lg bg-secondary/30">
                <h4 className="font-medium mb-2">Select Master Exchange</h4>
                <p className="text-sm text-muted-foreground">
                  Trades from this exchange will be copied to mirrors
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {connectedExchanges.map((exchange) => (
                  <button
                    key={exchange}
                    onClick={() => setMasterExchange(exchange)}
                    className={`p-4 rounded-xl border text-center transition-all ${
                      masterExchange === exchange
                        ? 'bg-accent/20 border-accent'
                        : 'bg-secondary/30 border-border hover:border-primary/50'
                    }`}
                  >
                    <p className="font-medium">{exchange}</p>
                    {masterExchange === exchange && (
                      <span className="text-xs text-accent">Master</span>
                    )}
                  </button>
                ))}
              </div>

              <Button
                className="w-full"
                onClick={() => setStep(2)}
                disabled={!masterExchange}
              >
                Continue →
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-lg bg-secondary/30">
                <h4 className="font-medium mb-2">Select Mirror Exchanges</h4>
                <p className="text-sm text-muted-foreground">
                  Trades will be copied to these exchanges
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {connectedExchanges
                  .filter(e => e !== masterExchange)
                  .map((exchange) => (
                    <button
                      key={exchange}
                      onClick={() => toggleMirror(exchange)}
                      className={`p-4 rounded-xl border text-center transition-all ${
                        mirrorExchanges.includes(exchange)
                          ? 'bg-primary/20 border-primary'
                          : 'bg-secondary/30 border-border hover:border-primary/50'
                      }`}
                    >
                      <p className="font-medium">{exchange}</p>
                      {mirrorExchanges.includes(exchange) && (
                        <Check className="w-4 h-4 mx-auto mt-1 text-primary" />
                      )}
                    </button>
                  ))}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)}>
                  ← Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => setStep(3)}
                  disabled={mirrorExchanges.length === 0}
                >
                  Continue →
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-lg bg-secondary/30">
                <h4 className="font-medium mb-2">Copy Mode</h4>
                <p className="text-sm text-muted-foreground">
                  How should trade sizes be calculated?
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => setCopyMode('exact')}
                  className={`w-full p-4 rounded-xl border text-left transition-all ${
                    copyMode === 'exact'
                      ? 'bg-primary/20 border-primary'
                      : 'bg-secondary/30 border-border hover:border-primary/50'
                  }`}
                >
                  <p className="font-medium">Exact Copy</p>
                  <p className="text-sm text-muted-foreground">Same size as master trade</p>
                </button>

                <button
                  onClick={() => setCopyMode('proportional')}
                  className={`w-full p-4 rounded-xl border text-left transition-all ${
                    copyMode === 'proportional'
                      ? 'bg-primary/20 border-primary'
                      : 'bg-secondary/30 border-border hover:border-primary/50'
                  }`}
                >
                  <p className="font-medium">Proportional</p>
                  <p className="text-sm text-muted-foreground">Multiply by ratio</p>
                  {copyMode === 'proportional' && (
                    <Input
                      type="number"
                      value={proportionalRatio}
                      onChange={(e) => setProportionalRatio(e.target.value)}
                      className="mt-2 bg-secondary/50"
                      placeholder="1.0"
                      step="0.1"
                    />
                  )}
                </button>

                <button
                  onClick={() => setCopyMode('fixed')}
                  className={`w-full p-4 rounded-xl border text-left transition-all ${
                    copyMode === 'fixed'
                      ? 'bg-primary/20 border-primary'
                      : 'bg-secondary/30 border-border hover:border-primary/50'
                  }`}
                >
                  <p className="font-medium">Fixed Size</p>
                  <p className="text-sm text-muted-foreground">Always use fixed USD amount</p>
                  {copyMode === 'fixed' && (
                    <Input
                      type="number"
                      value={fixedSize}
                      onChange={(e) => setFixedSize(e.target.value)}
                      className="mt-2 bg-secondary/50"
                      placeholder="350"
                    />
                  )}
                </button>
              </div>

              {/* Summary */}
              <div className="p-4 rounded-lg bg-accent/10 border border-accent/30">
                <p className="text-sm font-medium mb-2">Configuration Summary</p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-bold text-accent">{masterExchange}</span>
                  <ArrowRight className="w-4 h-4" />
                  <span>{mirrorExchanges.join(', ')}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Mode: {copyMode === 'exact' ? 'Exact Copy' : copyMode === 'proportional' ? `Proportional (${proportionalRatio}x)` : `Fixed ($${fixedSize})`}
                </p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)}>
                  ← Back
                </Button>
                <Button className="flex-1" onClick={handleSave}>
                  Save & Activate
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Progress indicator */}
        <div className="flex justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-all ${
                s === step ? 'bg-primary w-6' : s < step ? 'bg-success' : 'bg-secondary'
              }`}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
