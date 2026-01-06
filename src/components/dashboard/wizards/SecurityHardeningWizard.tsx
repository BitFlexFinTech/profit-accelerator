import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  Shield, 
  Check, 
  Loader2, 
  AlertTriangle, 
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Zap,
  Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { useSecurityScore } from '@/hooks/useSecurityScore';

interface SecurityHardeningWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WizardStep = 'welcome' | 'scan' | 'assessment' | 'exchange' | 'cloud' | 'integration' | 'summary';

interface CredentialFix {
  id: string;
  provider: string;
  issue: string;
  recommendation: string;
  status: 'pending' | 'fixing' | 'fixed' | 'skipped';
  howToFix: string[];
  externalUrl?: string;
}

export function SecurityHardeningWizard({ open, onOpenChange }: SecurityHardeningWizardProps) {
  const [step, setStep] = useState<WizardStep>('welcome');
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const { score, issues, runScan, fixIssue } = useSecurityScore();
  const [fixes, setFixes] = useState<CredentialFix[]>([]);
  const [initialScore, setInitialScore] = useState(0);
  const [currentScore, setCurrentScore] = useState(0);

  const resetWizard = () => {
    setStep('welcome');
    setIsScanning(false);
    setScanProgress(0);
    setFixes([]);
    setInitialScore(0);
    setCurrentScore(0);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(resetWizard, 300);
  };

  const handleStartScan = async () => {
    setStep('scan');
    setIsScanning(true);
    setScanProgress(0);

    // Simulate scanning progress
    const interval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 200);

    await runScan();
    
    setTimeout(() => {
      clearInterval(interval);
      setScanProgress(100);
      setIsScanning(false);
      setInitialScore(score);
      setCurrentScore(score);
      
      // Convert issues to fixes
      const newFixes: CredentialFix[] = issues.map(issue => ({
        id: issue.id,
        provider: issue.provider,
        issue: issue.message,
        recommendation: issue.recommendation,
        status: 'pending' as const,
        howToFix: [
          `Go to ${issue.provider} API settings`,
          `Find the API key configuration`,
          `Apply the recommended changes`,
          `Click Save`,
        ],
        externalUrl: getExternalUrl(issue.provider),
      }));
      
      setFixes(newFixes);
      setStep('assessment');
    }, 2500);
  };

  const getExternalUrl = (provider: string): string => {
    const urls: Record<string, string> = {
      Binance: 'https://www.binance.com/en/my/settings/api-management',
      Bybit: 'https://www.bybit.com/app/user/api-management',
      OKX: 'https://www.okx.com/account/my-api',
      Vultr: 'https://my.vultr.com/settings/#settingsapi',
      AWS: 'https://console.aws.amazon.com/iam/',
    };
    return urls[provider] || '#';
  };

  const handleFixIssue = async (fixId: string) => {
    setFixes(prev => prev.map(f => 
      f.id === fixId ? { ...f, status: 'fixing' as const } : f
    ));

    await fixIssue(fixId);

    setFixes(prev => prev.map(f => 
      f.id === fixId ? { ...f, status: 'fixed' as const } : f
    ));

    // Update score
    setCurrentScore(prev => Math.min(100, prev + 15));
    toast.success('Issue fixed!');
  };

  const handleSkipIssue = (fixId: string) => {
    setFixes(prev => prev.map(f => 
      f.id === fixId ? { ...f, status: 'skipped' as const } : f
    ));
  };

  const exchangeFixes = fixes.filter(f => ['Binance', 'Bybit', 'OKX', 'KuCoin'].includes(f.provider));
  const cloudFixes = fixes.filter(f => ['AWS', 'Vultr', 'Oracle', 'GCP', 'Linode'].includes(f.provider));
  const integrationFixes = fixes.filter(f => ['Telegram', 'Groq', 'Discord'].includes(f.provider));

  const criticalCount = fixes.filter(f => f.status === 'pending').length;
  const fixedCount = fixes.filter(f => f.status === 'fixed').length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-red-500" />
            Security Hardening Wizard
          </DialogTitle>
          <DialogDescription>
            Secure all your credentials with optimal settings
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-1 mb-4">
          {['welcome', 'scan', 'assessment', 'exchange', 'cloud', 'integration', 'summary'].map((s, i) => (
            <div 
              key={s}
              className={`h-1.5 w-6 rounded-full transition-colors ${
                step === s ? 'bg-primary' : 
                ['welcome', 'scan', 'assessment', 'exchange', 'cloud', 'integration', 'summary'].indexOf(step) > i 
                  ? 'bg-primary/50' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 'welcome' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
              <h3 className="font-semibold text-red-400 mb-2">Comprehensive Security Scan</h3>
              <p className="text-sm text-muted-foreground">
                This wizard will analyze all your connected credentials and guide you through securing each one with optimal settings.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <p className="text-2xl mb-1">🔐</p>
                <p className="text-xs text-muted-foreground">Exchange APIs</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <p className="text-2xl mb-1">☁️</p>
                <p className="text-xs text-muted-foreground">Cloud Providers</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <p className="text-2xl mb-1">🔗</p>
                <p className="text-xs text-muted-foreground">Integrations</p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-secondary/30">
              <h4 className="font-medium mb-2">What we'll check:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Withdrawal permissions (should be disabled)</li>
                <li>• IP restrictions (should be locked to VPS)</li>
                <li>• API scopes (minimal permissions)</li>
                <li>• Key rotation status (last 90 days)</li>
                <li>• Expiry dates and reminders</li>
              </ul>
            </div>

            <Button className="w-full" onClick={handleStartScan}>
              <Shield className="w-4 h-4 mr-2" />
              Start Security Scan
            </Button>
          </div>
        )}

        {/* Step 2: Scanning */}
        {step === 'scan' && (
          <div className="space-y-4 py-8">
            <div className="text-center">
              <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Scanning Credentials...</h3>
              <p className="text-sm text-muted-foreground">
                Analyzing permissions and security settings
              </p>
            </div>

            <Progress value={scanProgress} className="h-2" />
            
            <p className="text-xs text-center text-muted-foreground">
              {scanProgress < 30 ? 'Checking exchange APIs...' :
               scanProgress < 60 ? 'Analyzing cloud credentials...' :
               scanProgress < 90 ? 'Reviewing integrations...' : 'Generating report...'}
            </p>
          </div>
        )}

        {/* Step 3: Risk Assessment */}
        {step === 'assessment' && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-lg bg-secondary/30">
              <div className="text-center">
                <p className={`text-3xl font-bold ${currentScore >= 70 ? 'text-success' : currentScore >= 40 ? 'text-warning' : 'text-destructive'}`}>
                  {currentScore}
                </p>
                <p className="text-xs text-muted-foreground">/100</p>
              </div>
              <div className="flex-1">
                <p className={`font-semibold ${currentScore >= 70 ? 'text-success' : currentScore >= 40 ? 'text-warning' : 'text-destructive'}`}>
                  {currentScore >= 70 ? 'Good' : currentScore >= 40 ? 'Fair' : 'Poor'}
                </p>
                <Progress value={currentScore} className="h-2 mt-2" />
              </div>
            </div>

            {criticalCount > 0 && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  <span className="font-semibold text-destructive">
                    {criticalCount} issues found
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  We found security issues that should be fixed to protect your trading.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {fixes.slice(0, 3).map((fix) => (
                <div 
                  key={fix.id}
                  className={`p-3 rounded-lg ${
                    fix.status === 'fixed' ? 'bg-success/10 border border-success/30' :
                    fix.status === 'skipped' ? 'bg-muted/50' :
                    'bg-secondary/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{fix.provider}</p>
                      <p className="text-xs text-muted-foreground">{fix.issue}</p>
                    </div>
                    {fix.status === 'fixed' ? (
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    ) : fix.status === 'skipped' ? (
                      <span className="text-xs text-muted-foreground">Skipped</span>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Button className="w-full" onClick={() => setStep(exchangeFixes.length > 0 ? 'exchange' : cloudFixes.length > 0 ? 'cloud' : 'summary')}>
              Fix Issues
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {/* Step 4: Exchange Hardening */}
        {step === 'exchange' && (
          <div className="space-y-4">
            <h3 className="font-semibold">Exchange API Hardening</h3>
            
            {exchangeFixes.length === 0 ? (
              <div className="p-4 rounded-lg bg-success/10 border border-success/30 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-success" />
                <p className="text-sm text-success">All exchange APIs are properly secured!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {exchangeFixes.map((fix) => (
                  <div 
                    key={fix.id}
                    className={`p-4 rounded-lg ${
                      fix.status === 'fixed' ? 'bg-success/10 border border-success/30' :
                      'bg-secondary/30'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold">{fix.provider} API</p>
                        <p className="text-sm text-destructive">{fix.issue}</p>
                      </div>
                      {fix.status === 'fixed' && (
                        <CheckCircle2 className="w-5 h-5 text-success" />
                      )}
                    </div>

                    {fix.status === 'pending' && (
                      <>
                        <p className="text-sm text-muted-foreground mb-3">
                          {fix.recommendation}
                        </p>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => handleFixIssue(fix.id)}
                          >
                            <Zap className="w-3 h-3 mr-1" />
                            Auto-Fix
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => window.open(fix.externalUrl, '_blank')}
                          >
                            Manual Fix
                            <ExternalLink className="w-3 h-3 ml-1" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => handleSkipIssue(fix.id)}
                          >
                            Skip
                          </Button>
                        </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => window.open(fix.externalUrl, '_blank')}
                          >
                            Manual Fix
                            <ExternalLink className="w-3 h-3 ml-1" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => handleSkipIssue(fix.id)}
                          >
                            Skip
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button className="w-full" onClick={() => setStep(cloudFixes.length > 0 ? 'cloud' : 'summary')}>
              Continue
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {/* Step 5: Cloud Hardening */}
        {step === 'cloud' && (
          <div className="space-y-4">
            <h3 className="font-semibold">Cloud Provider Hardening</h3>
            
            {cloudFixes.length === 0 ? (
              <div className="p-4 rounded-lg bg-success/10 border border-success/30 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-success" />
                <p className="text-sm text-success">All cloud credentials are properly secured!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cloudFixes.map((fix) => (
                  <div 
                    key={fix.id}
                    className={`p-4 rounded-lg ${
                      fix.status === 'fixed' ? 'bg-success/10 border border-success/30' :
                      'bg-secondary/30'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold">{fix.provider}</p>
                        <p className="text-sm text-warning">{fix.issue}</p>
                      </div>
                      {fix.status === 'fixed' && (
                        <CheckCircle2 className="w-5 h-5 text-success" />
                      )}
                    </div>

                    {fix.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => window.open(fix.externalUrl, '_blank')}
                        >
                          Fix in Console
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => handleFixIssue(fix.id)}
                        >
                          Mark Fixed
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => handleSkipIssue(fix.id)}
                        >
                          Skip
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button className="w-full" onClick={() => setStep('summary')}>
              Continue to Summary
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {/* Step 6: Integration Hardening - Skipped if none */}
        {step === 'integration' && (
          <div className="space-y-4">
            <h3 className="font-semibold">Integration Hardening</h3>
            {/* Similar structure to exchange/cloud */}
            <Button className="w-full" onClick={() => setStep('summary')}>
              Continue to Summary
            </Button>
          </div>
        )}

        {/* Step 7: Summary */}
        {step === 'summary' && (
          <div className="space-y-4">
            <div className="p-6 rounded-lg bg-success/10 border border-success/30 text-center">
              <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-success mb-1">Security Hardening Complete!</h3>
              <p className="text-sm text-muted-foreground">
                Your credentials are now better protected.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-secondary/30 text-center">
                <p className="text-sm text-muted-foreground">Initial Score</p>
                <p className="text-2xl font-bold text-destructive">{initialScore}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30 text-center">
                <p className="text-sm text-muted-foreground">Final Score</p>
                <p className="text-2xl font-bold text-success">{currentScore}</p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-secondary/30">
              <div className="flex justify-between text-sm mb-2">
                <span>Issues Fixed</span>
                <span className="font-medium text-success">{fixedCount}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span>Issues Skipped</span>
                <span className="font-medium text-muted-foreground">{fixes.filter(f => f.status === 'skipped').length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Improvement</span>
                <span className="font-medium text-success">+{currentScore - initialScore} points</span>
              </div>
            </div>

            <Button className="w-full" onClick={handleClose}>
              <Check className="w-4 h-4 mr-2" />
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}