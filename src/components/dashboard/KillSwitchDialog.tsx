import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface KillSwitchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KillSwitchDialog({ open, onOpenChange }: KillSwitchDialogProps) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleKillSwitch = async () => {
    if (code.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // In production, this would call the kill-switch edge function
      console.log('Kill switch activated with code:', code);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Close all positions, stop all trading
      alert('🚨 KILL SWITCH ACTIVATED - All trading stopped');
      onOpenChange(false);
      setCode('');
    } catch (err) {
      setError('Failed to activate kill switch');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card border-destructive/50 sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <DialogTitle className="text-destructive">Emergency Kill Switch</DialogTitle>
              <DialogDescription>
                This will immediately stop all trading activity
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
            <p className="text-sm text-destructive font-medium">
              ⚠️ Warning: This action will:
            </p>
            <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>Close all open positions</li>
              <li>Cancel all pending orders</li>
              <li>Stop the Trade Copier</li>
              <li>Disable all automated trading</li>
            </ul>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">
              Enter 6-digit kill code to confirm
            </label>
            <Input
              type="text"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-2xl tracking-[0.5em] font-mono bg-secondary/50"
              maxLength={6}
            />
          </div>

          {error && (
            <p className="text-destructive text-sm text-center">{error}</p>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleKillSwitch}
              disabled={isLoading || code.length !== 6}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Activating...
                </>
              ) : (
                'Activate Kill Switch'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
