import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle2, XCircle, Loader2, Shield, Copy, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';

interface VerificationResult {
  success: boolean;
  vpsIp?: string;
  provider?: string;
  healthCheck: {
    ok: boolean;
    version?: string;
    error?: string;
  };
  signalCheck: {
    ok: boolean;
    hasEndpoint: boolean;
    error?: string;
  };
  manualFixCommands?: string;
  error?: string;
}

export function DeployVPSApiButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [copied, setCopied] = useState(false);

  const handleVerify = async () => {
    setIsVerifying(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('deploy-vps-api');

      if (error) {
        setResult({
          success: false,
          healthCheck: { ok: false, error: error.message },
          signalCheck: { ok: false, hasEndpoint: false, error: error.message },
          error: error.message,
        });
        toast.error('Verification failed');
      } else {
        setResult(data as VerificationResult);
        if (data.success) {
          toast.success('VPS API verified successfully');
        } else {
          toast.warning('VPS API needs attention');
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setResult({
        success: false,
        healthCheck: { ok: false, error: errorMessage },
        signalCheck: { ok: false, hasEndpoint: false, error: errorMessage },
        error: errorMessage,
      });
      toast.error('Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCopyCommands = () => {
    if (result?.manualFixCommands) {
      navigator.clipboard.writeText(result.manualFixCommands);
      setCopied(true);
      toast.success('Commands copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setResult(null);
    setCopied(false);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2"
      >
        <Shield className="h-4 w-4" />
        Verify VPS API
      </Button>

      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              VPS API Verification
            </DialogTitle>
            <DialogDescription>
              Check if the VPS Bot Control API is properly configured and responding.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {!result && !isVerifying && (
              <div className="text-center py-6">
                <p className="text-muted-foreground mb-4">
                  This will verify the /health and /signal-check endpoints on your VPS.
                </p>
                <Button onClick={handleVerify} className="gap-2">
                  <Shield className="h-4 w-4" />
                  Start Verification
                </Button>
              </div>
            )}

            {isVerifying && (
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Verifying VPS API endpoints...</p>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                {/* VPS Info */}
                {result.vpsIp && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-sm">
                      <span className="text-muted-foreground">VPS IP:</span>{' '}
                      <span className="font-mono">{result.vpsIp}</span>
                      {result.provider && (
                        <span className="text-muted-foreground ml-2">({result.provider})</span>
                      )}
                    </p>
                  </div>
                )}

                {/* Status Summary */}
                <div className={`rounded-lg p-4 ${
                  result.success 
                    ? 'bg-green-500/10 border border-green-500/30' 
                    : 'bg-yellow-500/10 border border-yellow-500/30'
                }`}>
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    )}
                    <span className="font-medium">
                      {result.success ? 'All Endpoints Verified' : 'API Needs Update'}
                    </span>
                  </div>
                </div>

                {/* Endpoint Details */}
                <div className="space-y-2">
                  {/* Health Check */}
                  <div className={`flex items-center justify-between p-3 rounded-lg ${
                    result.healthCheck.ok ? 'bg-green-500/10' : 'bg-destructive/10'
                  }`}>
                    <div className="flex items-center gap-2">
                      {result.healthCheck.ok ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <span className="font-mono text-sm">/health</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {result.healthCheck.ok 
                        ? `v${result.healthCheck.version}` 
                        : result.healthCheck.error}
                    </span>
                  </div>

                  {/* Signal Check */}
                  <div className={`flex items-center justify-between p-3 rounded-lg ${
                    result.signalCheck.ok ? 'bg-green-500/10' : 'bg-destructive/10'
                  }`}>
                    <div className="flex items-center gap-2">
                      {result.signalCheck.ok ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <span className="font-mono text-sm">/signal-check</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {result.signalCheck.ok 
                        ? 'Available' 
                        : result.signalCheck.error}
                    </span>
                  </div>
                </div>

                {/* Manual Fix Commands */}
                {!result.success && result.manualFixCommands && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Manual Fix Required</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyCommands}
                        className="gap-2"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                        {copied ? 'Copied!' : 'Copy Commands'}
                      </Button>
                    </div>
                    <ScrollArea className="h-48 rounded-lg border bg-muted/30 p-3">
                      <pre className="text-xs font-mono whitespace-pre-wrap">
                        {result.manualFixCommands}
                      </pre>
                    </ScrollArea>
                    <p className="text-xs text-muted-foreground">
                      SSH to your VPS and run these commands, then click "Re-verify" below.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
            {result && !result.success && (
              <Button onClick={handleVerify} disabled={isVerifying} className="gap-2">
                {isVerifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Shield className="h-4 w-4" />
                )}
                Re-verify
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DeployVPSApiButton;
