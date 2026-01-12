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
import { useBotPreflight, PreflightCheck } from '@/hooks/useBotPreflight';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Send, Zap, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface BotPreflightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmStart: () => void;
}

export function BotPreflightDialog({ open, onOpenChange, onConfirmStart }: BotPreflightDialogProps) {
  const { runPreflight, sendTestSignal, triggerAIScan, isRunning, result, clearResult } = useBotPreflight();
  const [isSendingTestSignal, setIsSendingTestSignal] = useState(false);
  const [isTriggeringAI, setIsTriggeringAI] = useState(false);

  useEffect(() => {
    if (open) {
      clearResult();
      runPreflight();
    }
  }, [open, runPreflight, clearResult]);

  const handleSendTestSignal = async () => {
    setIsSendingTestSignal(true);
    try {
      const signalResult = await sendTestSignal();
      if (signalResult.success) {
        toast.success('Test signal sent! Check AI Market Analysis panel.');
        // Re-run preflight to pick up the new signal
        setTimeout(() => runPreflight(), 1500);
      } else {
        toast.error(`Failed to send test signal: ${signalResult.error}`);
      }
    } catch (err) {
      toast.error('Failed to send test signal');
    } finally {
      setIsSendingTestSignal(false);
    }
  };

  const handleTriggerAIScan = async () => {
    setIsTriggeringAI(true);
    try {
      const scanResult = await triggerAIScan();
      if (scanResult.success) {
        toast.success('AI scan triggered! New signals generating...');
        // Re-run preflight after a delay to pick up new signals
        setTimeout(() => runPreflight(), 3000);
      } else {
        toast.error(`AI scan failed: ${scanResult.error}`);
      }
    } catch (err) {
      toast.error('Failed to trigger AI scan');
    } finally {
      setIsTriggeringAI(false);
    }
  };

  const handleConfirm = () => {
    onOpenChange(false);
    onConfirmStart();
  };

  const getStatusIcon = (status: PreflightCheck['status']) => {
    switch (status) {
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

  const getStatusBadge = (status: PreflightCheck['status']) => {
    switch (status) {
      case 'pass':
        return <Badge variant="default" className="bg-success text-success-foreground text-[10px]">PASS</Badge>;
      case 'fail':
        return <Badge variant="destructive" className="text-[10px]">FAIL</Badge>;
      case 'warn':
        return <Badge variant="secondary" className="bg-warning text-warning-foreground text-[10px]">WARN</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">...</Badge>;
    }
  };

  const criticalFailures = result?.checks.filter(c => c.critical && c.status === 'fail') || [];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            🐟 Bot Preflight Checks
            {isRunning && <Loader2 className="w-4 h-4 animate-spin" />}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Verifying system readiness for LIVE trading...
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 my-4">
          {isRunning && !result ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : result ? (
            <>
              {result.checks.map((check, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 rounded bg-muted/30">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(check.status)}
                    <span className="text-sm font-medium">{check.name}</span>
                    {check.critical && <Badge variant="outline" className="text-[9px]">Required</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(check.status)}
                  </div>
                </div>
              ))}
              
              {result.checks.map((check, i) => (
                check.message && (
                  <div key={`msg-${i}`} className="text-xs text-muted-foreground pl-6">
                    {check.name}: {check.message}
                  </div>
                )
              ))}

              {/* Top Signal Display */}
              {result.topSignal && (
                <div className="mt-3 p-3 bg-primary/10 rounded border border-primary/20">
                  <div className="text-xs font-medium text-primary mb-1">🎯 Top AI Signal Ready</div>
                  <div className="text-sm font-bold">
                    {result.topSignal.symbol} {result.topSignal.recommended_side?.toUpperCase()} 
                    <span className="text-muted-foreground ml-2">({result.topSignal.confidence}% confidence)</span>
                  </div>
                </div>
              )}

              {/* Blocking reasons */}
              {result.reasons.length > 0 && criticalFailures.length > 0 && (
                <div className="mt-3 p-3 bg-destructive/10 rounded border border-destructive/20">
                  <div className="text-xs font-medium text-destructive mb-1">Cannot Start - Fix These Issues:</div>
                  <ul className="text-xs text-destructive/80 list-disc pl-4 space-y-1">
                    {result.reasons.slice(0, 3).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Action buttons for generating signals */}
        <div className="flex gap-2 mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTriggerAIScan}
            disabled={isTriggeringAI || isRunning}
            className="flex-1"
          >
            {isTriggeringAI ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
            Generate AI Signals
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSendTestSignal}
            disabled={isSendingTestSignal || isRunning}
            className="flex-1"
          >
            {isSendingTestSignal ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
            Send Test Signal
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => runPreflight()}
            disabled={isRunning}
          >
            <RefreshCw className={`w-3 h-3 ${isRunning ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isRunning || !result?.canStart}
            className="bg-success hover:bg-success/90"
          >
            {result?.canStart ? '🚀 Start LIVE Trading' : '❌ Cannot Start'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
