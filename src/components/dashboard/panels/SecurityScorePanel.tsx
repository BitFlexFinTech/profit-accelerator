import { useState } from 'react';
import { Shield, AlertTriangle, CheckCircle2, ChevronRight, Zap, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useSecurityScore } from '@/hooks/useSecurityScore';

interface SecurityScorePanelProps {
  onOpenWizard?: () => void;
}

export function SecurityScorePanel({ onOpenWizard }: SecurityScorePanelProps) {
  const { score, issues, isLoading, isScanning, runScan, fixIssue } = useSecurityScore();
  const [fixingId, setFixingId] = useState<string | null>(null);

  const criticalIssues = issues.filter(i => i.severity === 'critical');
  const warningIssues = issues.filter(i => i.severity === 'warning');

  const getScoreColor = () => {
    if (score >= 80) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreLabel = () => {
    if (score >= 80) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Poor';
  };

  const handleAutoFix = async (issueId: string) => {
    setFixingId(issueId);
    await fixIssue(issueId);
    setFixingId(null);
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="font-semibold">Security Score</h3>
            <p className="text-sm text-muted-foreground">Credential analysis</p>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={runScan}
          disabled={isScanning}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isScanning ? 'animate-spin' : ''}`} />
          Scan
        </Button>
      </div>

      {/* Score Display */}
      <div className="flex items-center gap-6 mb-6">
        <div className="text-center">
          <p className={`text-4xl font-bold ${getScoreColor()}`}>{score}</p>
          <p className="text-sm text-muted-foreground">/100</p>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-medium ${getScoreColor()}`}>{getScoreLabel()}</span>
            <span className="text-xs text-muted-foreground">{issues.length} issues found</span>
          </div>
          <Progress value={score} className="h-2" />
        </div>
      </div>

      {/* Critical Issues */}
      {criticalIssues.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-destructive mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            CRITICAL ({criticalIssues.length})
          </p>
          <div className="space-y-2">
            {criticalIssues.slice(0, 2).map((issue) => (
              <div 
                key={issue.id}
                className="p-3 rounded-lg bg-destructive/10 border border-destructive/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{issue.provider} API</p>
                    <p className="text-xs text-muted-foreground">{issue.message}</p>
                  </div>
                  {issue.canAutoFix && (
                    <Button 
                      size="sm" 
                      variant="destructive"
                      onClick={() => handleAutoFix(issue.id)}
                      disabled={fixingId === issue.id}
                    >
                      {fixingId === issue.id ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <Zap className="w-3 h-3 mr-1" />
                          Fix
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warning Issues */}
      {warningIssues.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-warning mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            WARNINGS ({warningIssues.length})
          </p>
          <div className="space-y-2">
            {warningIssues.slice(0, 2).map((issue) => (
              <div 
                key={issue.id}
                className="p-3 rounded-lg bg-warning/10 border border-warning/30"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{issue.provider}</p>
                    <p className="text-xs text-muted-foreground">{issue.message}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Clear */}
      {issues.length === 0 && (
        <div className="p-4 rounded-lg bg-success/10 border border-success/30 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-success" />
          <div>
            <p className="font-medium text-success">All credentials secured</p>
            <p className="text-xs text-muted-foreground">No security issues detected</p>
          </div>
        </div>
      )}

      {/* Run Full Wizard */}
      {issues.length > 0 && onOpenWizard && (
        <Button className="w-full mt-4" onClick={onOpenWizard}>
          <Shield className="w-4 h-4 mr-2" />
          Run Security Wizard
        </Button>
      )}
    </div>
  );
}