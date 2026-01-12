import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Send, Zap } from 'lucide-react';
import { useBotPreflight, PreflightCheck, PreflightResult } from '@/hooks/useBotPreflight';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface BotPreflightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmStart: () => void;
}

export function BotPreflightDialog({ open, onOpenChange, onConfirmStart }: BotPreflightDialogProps) {
  const { runPreflight, sendTestSignal, isRunning, result } = useBotPreflight();
  const [isSendingSignal, setIsSendingSignal] = useState(false);

  // Run preflight when dialog opens
  useEffect(() => {
    if (open) {
      runPreflight();
    }
  }, [open, runPreflight]);

  const handleSendTestSignal = async () => {
    setIsSendingSignal(true);
    const result = await sendTestSignal();
    setIsSendingSignal(false);

    if (result.success) {
      toast.success('Test signal sent!', {
        description: `Signal ID: ${result.signalId?.slice(0, 8)}... - Bot should process this within 30 seconds`
      });
      // Re-run preflight to update signal count
      setTimeout(() => runPreflight(), 1000);
    } else {
      toast.error('Failed to send test signal', {
        description: result.error
      });
    }
  };

  const handleConfirm = () => {
    onOpenChange(false);
    onConfirmStart();
  };

  const getStatusIcon = (check: PreflightCheck) => {
    switch (check.status) {
      case 'pass':
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'warn':
        return <AlertTriangle className="w-4 h-4 text-warning" />;
      default:
        return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
    }
  };

  const getStatusBadge = (check: PreflightCheck) => {
    switch (check.status) {
      case 'pass':
        return <Badge variant="outline" className="bg-success/10 text-success border-success/30">PASS</Badge>;
      case 'fail':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">FAIL</Badge>;
      case 'warn':
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">WARN</Badge>;
      default:
        return <Badge variant="outline">CHECKING</Badge>;
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-destructive" />
            Start Bot in LIVE Mode
          </AlertDialogTitle>
          <AlertDialogDescription>
            Running preflight checks before starting the trading bot with real funds.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 my-4">
          {isRunning && !result ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-muted-foreground">Running preflight checks...</span>
            </div>
          ) : result ? (
            <>
              {result.checks.map((check, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border",
                    check.status === 'fail' && check.critical ? 'bg-destructive/5 border-destructive/30' :
                    check.status === 'warn' ? 'bg-warning/5 border-warning/30' :
                    check.status === 'pass' ? 'bg-success/5 border-success/30' :
                    'bg-muted/50 border-border'
                  )}
                >
                  {getStatusIcon(check)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 justify-between">
                      <span className="font-medium text-sm">{check.name}</span>
                      {getStatusBadge(check)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{check.message}</p>
                  </div>
                </div>
              ))}

              {/* Test Signal Button - always visible */}
              <div className="pt-2 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSendTestSignal}
                  disabled={isSendingSignal || !result.vpsReady}
                  className="w-full"
                >
                  {isSendingSignal ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Send Test Signal (BTC LONG 85%)
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  This sends a test trade signal to verify the bot processes signals correctly.
                </p>
              </div>

              {/* Summary */}
              {!result.canStart && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                  <p className="text-sm text-destructive font-medium">
                    Cannot start: Fix the critical issues above first.
                  </p>
                </div>
              )}

              {result.canStart && result.signalCount === 0 && (
                <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                  <p className="text-sm text-warning font-medium">
                    Ready to start, but no signals yet. Bot will wait for AI/strategy signals.
                  </p>
                </div>
              )}
            </>
          ) : null}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            onClick={handleConfirm}
            disabled={isRunning || !result?.canStart}
            variant="destructive"
            className="gap-2"
          >
            {isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            Start LIVE Trading
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
