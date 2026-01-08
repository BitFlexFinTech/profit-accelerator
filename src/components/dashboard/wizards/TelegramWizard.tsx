import { useState, useEffect } from 'react';
import { MessageCircle, ExternalLink, Check, Loader2, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { ActionButton } from '@/components/ui/ActionButton';
import { BUTTON_TOOLTIPS } from '@/config/buttonTooltips';

interface TelegramWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TelegramWizard({ open, onOpenChange }: TelegramWizardProps) {
  const [step, setStep] = useState(1);
  const [botToken, setBotToken] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState('');

  // Poll for /start command when on step 3
  useEffect(() => {
    if (step !== 3 || !botToken || chatId) return;

    setIsPolling(true);
    const pollInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('telegram-bot', {
          body: { action: 'get-updates', botToken }
        });

        if (data?.chatId) {
          setChatId(data.chatId);
          setIsPolling(false);
          clearInterval(pollInterval);
          // Auto-advance to step 4
          handleSaveConfig(data.chatId);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [step, botToken, chatId]);

  const handleValidateToken = async () => {
    if (!botToken.trim()) {
      setError('Please enter a bot token');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const { data, error: fnError } = await supabase.functions.invoke('telegram-bot', {
        body: { action: 'validate', botToken }
      });

      if (fnError || !data?.success) {
        setError(data?.error || 'Invalid bot token');
        setIsLoading(false);
        return;
      }

      setBotUsername(data.bot.username);
      setStep(3);
    } catch (err) {
      setError('Failed to validate token');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async (detectedChatId: string) => {
    setIsLoading(true);
    
    try {
      // Save config
      await supabase.functions.invoke('telegram-bot', {
        body: { action: 'save-config', botToken, chatId: detectedChatId }
      });

      // Send test message
      await supabase.functions.invoke('telegram-bot', {
        body: { 
          action: 'send-message', 
          message: '✅ <b>Telegram Bot Connected!</b>\n\nYour trading notifications are now active.\n\nAvailable commands:\n/kill - Emergency stop\n/pnl - Today\'s P&L\n/status - Trading status',
          botToken,
          chatId: detectedChatId
        }
      });

      setStep(4);
    } catch (err) {
      setError('Failed to save configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const resetAndClose = () => {
    setStep(1);
    setBotToken('');
    setBotUsername('');
    setChatId(null);
    setError('');
    setIsPolling(false);
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
              <p className="text-sm text-muted-foreground">Step {step} of 4</p>
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
              
              <ActionButton
                className="w-full gap-2"
                onClick={() => window.open('https://t.me/BotFather', '_blank')}
                tooltip={BUTTON_TOOLTIPS.openBotFather}
              >
                <ExternalLink className="w-4 h-4" />
                Open @BotFather in Telegram
              </ActionButton>

              <ActionButton
                variant="outline"
                className="w-full"
                onClick={() => setStep(2)}
                tooltip={BUTTON_TOOLTIPS.haveBotToken}
              >
                I have my bot token →
              </ActionButton>
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

              {error && (
                <p className="text-destructive text-sm">{error}</p>
              )}

              <div className="flex gap-3">
                <ActionButton variant="outline" onClick={() => setStep(1)} tooltip={BUTTON_TOOLTIPS.goBack}>
                  ← Back
                </ActionButton>
                <ActionButton
                  className="flex-1"
                  onClick={handleValidateToken}
                  disabled={!botToken || isLoading}
                  tooltip={BUTTON_TOOLTIPS.validateToken}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    'Validate Token'
                  )}
                </ActionButton>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-lg bg-secondary/30">
                <h4 className="font-medium mb-2">Step 3: Start Your Bot</h4>
                <p className="text-sm text-muted-foreground">
                  Open your bot and send <code className="bg-background px-1 rounded">/start</code> to connect
                </p>
              </div>

              <ActionButton
                className="w-full gap-2"
                onClick={() => window.open(`https://t.me/${botUsername}`, '_blank')}
                tooltip={BUTTON_TOOLTIPS.openTelegramBot}
              >
                <Send className="w-4 h-4" />
                Open @{botUsername}
              </ActionButton>

              <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Waiting for /start command...</span>
              </div>

              {error && (
                <p className="text-destructive text-sm text-center">{error}</p>
              )}

              <ActionButton variant="outline" className="w-full" onClick={() => setStep(2)} tooltip={BUTTON_TOOLTIPS.goBack}>
                ← Back
              </ActionButton>
            </div>
          )}

          {step === 4 && (
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
                  <li>/kill - Emergency kill switch ⚠️</li>
                  <li>/pnl - Today's P&L summary</li>
                  <li>/status - Check trading status</li>
                </ul>
              </div>

              <div className="p-4 rounded-lg bg-success/10 border border-success/30 text-left">
                <h5 className="font-medium text-success mb-1">Notifications Active:</h5>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>✓ Real-time trade alerts</li>
                  <li>✓ Daily P&L summaries</li>
                  <li>✓ Error notifications</li>
                </ul>
              </div>

              <ActionButton className="w-full" onClick={resetAndClose} tooltip={BUTTON_TOOLTIPS.done}>
                Done
              </ActionButton>
            </div>
          )}
        </div>

        {/* Progress indicator */}
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4].map((s) => (
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