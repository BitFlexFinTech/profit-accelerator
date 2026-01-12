import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Upload, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Terminal,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DeployStep {
  step: string;
  success: boolean;
  output?: string;
  error?: string;
}

interface DeployResult {
  success: boolean;
  ip?: string;
  provider?: string;
  version?: string;
  healthOk?: boolean;
  signalCheckOk?: boolean;
  results?: {
    steps: DeployStep[];
  };
  error?: string;
}

export function DeployVPSApiButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [result, setResult] = useState<DeployResult | null>(null);

  const handleDeploy = async () => {
    setIsDeploying(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('deploy-vps-api');

      if (error) {
        setResult({ success: false, error: error.message });
        toast.error('Deployment failed: ' + error.message);
        return;
      }

      setResult(data);
      
      if (data.success) {
        toast.success(`VPS API deployed successfully (v${data.version || '2.0'})`);
      } else if (data.healthOk || data.signalCheckOk) {
        toast.warning('Deployment partially successful - check details');
      } else {
        toast.error('Deployment failed - check details');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setResult({ success: false, error: errorMsg });
      toast.error('Deployment error: ' + errorMsg);
    } finally {
      setIsDeploying(false);
    }
  };

  const getStepIcon = (step: DeployStep) => {
    if (step.success) {
      return <CheckCircle2 className="h-4 w-4 text-success" />;
    }
    return <XCircle className="h-4 w-4 text-destructive" />;
  };

  const getStepLabel = (step: string) => {
    const labels: Record<string, string> = {
      backup: 'Backup existing file',
      mkdir: 'Create directory',
      write: 'Write API file',
      restart: 'Restart service',
      verify_health: 'Verify /health',
      verify_signal_check: 'Verify /signal-check',
    };
    return labels[step] || step;
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2"
      >
        <Upload className="h-4 w-4" />
        Deploy VPS API
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Deploy VPS Bot Control API
            </DialogTitle>
            <DialogDescription>
              This will deploy the latest version of the VPS Bot Control API to your active VPS server.
              The service will be restarted automatically.
            </DialogDescription>
          </DialogHeader>

          {/* Deployment Progress / Results */}
          <div className="py-4 space-y-4">
            {isDeploying && (
              <div className="flex flex-col items-center gap-3 py-6">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Deploying to VPS...</p>
                <p className="text-xs text-muted-foreground">This may take 30-60 seconds</p>
              </div>
            )}

            {result && !isDeploying && (
              <div className="space-y-4">
                {/* Status Banner */}
                <div className={cn(
                  "p-3 rounded-lg border flex items-center gap-3",
                  result.success 
                    ? "bg-success/10 border-success/30" 
                    : result.healthOk || result.signalCheckOk
                      ? "bg-warning/10 border-warning/30"
                      : "bg-destructive/10 border-destructive/30"
                )}>
                  {result.success ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : result.healthOk || result.signalCheckOk ? (
                    <AlertTriangle className="h-5 w-5 text-warning" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive" />
                  )}
                  <div>
                    <p className="font-medium">
                      {result.success 
                        ? 'Deployment Successful' 
                        : result.healthOk || result.signalCheckOk
                          ? 'Partially Deployed'
                          : 'Deployment Failed'}
                    </p>
                    {result.ip && (
                      <p className="text-xs text-muted-foreground">
                        {result.provider} @ {result.ip}
                      </p>
                    )}
                  </div>
                  {result.version && (
                    <Badge variant="outline" className="ml-auto">
                      v{result.version}
                    </Badge>
                  )}
                </div>

                {/* Error Message */}
                {result.error && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                    <p className="text-sm text-destructive">{result.error}</p>
                  </div>
                )}

                {/* Verification Status */}
                {(result.healthOk !== undefined || result.signalCheckOk !== undefined) && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className={cn(
                      "p-2 rounded border flex items-center gap-2",
                      result.healthOk ? "bg-success/10 border-success/30" : "bg-destructive/10 border-destructive/30"
                    )}>
                      {result.healthOk ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
                      <span className="text-sm">/health</span>
                    </div>
                    <div className={cn(
                      "p-2 rounded border flex items-center gap-2",
                      result.signalCheckOk ? "bg-success/10 border-success/30" : "bg-destructive/10 border-destructive/30"
                    )}>
                      {result.signalCheckOk ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
                      <span className="text-sm">/signal-check</span>
                    </div>
                  </div>
                )}

                {/* Detailed Steps */}
                {result.results?.steps && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Deployment Steps:</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {result.results.steps.map((step, idx) => (
                        <div 
                          key={idx}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded text-sm",
                            step.success ? "bg-muted/50" : "bg-destructive/10"
                          )}
                        >
                          {getStepIcon(step)}
                          <span className="flex-1">{getStepLabel(step.step)}</span>
                          {step.error && (
                            <span className="text-xs text-destructive truncate max-w-32">
                              {step.error}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!isDeploying && !result && (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-2">
                  Click Deploy to update your VPS with the latest Bot Control API.
                </p>
                <p className="text-xs text-muted-foreground">
                  This will fix missing endpoints like <code>/signal-check</code>
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              {result ? 'Close' : 'Cancel'}
            </Button>
            <Button 
              onClick={handleDeploy} 
              disabled={isDeploying}
              className="gap-2"
            >
              {isDeploying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deploying...
                </>
              ) : result ? (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Redeploy
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Deploy
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
