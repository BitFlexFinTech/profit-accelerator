import { useState } from 'react';
import { MessageCircle, ExternalLink, Check, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TelegramWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TelegramWizard({ open, onOpenChange }: TelegramWizardProps) {
  const [step, setStep] = useState(1);
  const [botToken, setBotToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const handleConnect = async () => {
    setIsLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsConnected(true);
    setIsLoading(false);
    setStep(3);
  };

  const resetAndClose = () => {
    setStep(1);
    setBotToken('');
    setIsConnected(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#0088cc]/20 flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-[#0088cc]" />
            </div>
            <div>
              <DialogTitle>Telegram Bot Setup</DialogTitle>
              <p className="text-sm text-muted-foreground">Step {step} of 3</p>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-lg bg-secondary/30">
                <h4 className="font-medium mb-2">Step 1: Create a Telegram Bot</h4>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Open Telegram and search for @BotFather</li>
                  <li>Send /newbot and follow the prompts</li>
                  <li>Copy the bot token provided</li>
                </ol>
              </div>
              
              <Button
                className="w-full gap-2"
                onClick={() => window.open('https://t.me/BotFather', '_blank')}
              >
                <ExternalLink className="w-4 h-4" />
                Open @BotFather in Telegram
              </Button>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setStep(2)}
              >
                I have my bot token →
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-lg bg-secondary/30">
                <h4 className="font-medium mb-2">Step 2: Enter Bot Token</h4>
                <p className="text-sm text-muted-foreground">
                  Paste the token from @BotFather below
                </p>
              </div>

              <Input
                type="password"
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                className="font-mono bg-secondary/50"
              />

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)}>
                  ← Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleConnect}
                  disabled={!botToken || isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    'Connect Bot'
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-fade-in text-center">
              <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-success" />
              </div>
              
              <div>
                <h4 className="font-semibold text-lg">Bot Connected!</h4>
                <p className="text-sm text-muted-foreground">
                  Your Telegram bot is now linked to the Command Center
                </p>
              </div>

              <div className="p-4 rounded-lg bg-secondary/30 text-left">
                <h5 className="font-medium mb-2">Available Commands:</h5>
                <ul className="text-sm text-muted-foreground space-y-1 font-mono">
                  <li>/status - Check trading status</li>
                  <li>/balance - View balances</li>
                  <li>/kill - Emergency kill switch</li>
                  <li>/pnl - Today's P&L</li>
                </ul>
              </div>

              <Button className="w-full" onClick={resetAndClose}>
                Done
              </Button>
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
