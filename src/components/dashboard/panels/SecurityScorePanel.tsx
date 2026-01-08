import { useState } from 'react';
import { Shield, AlertTriangle, CheckCircle2, ChevronRight, Zap, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useSecurityScore } from '@/hooks/useSecurityScore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IconContainer } from '@/components/ui/IconContainer';
import { cn } from '@/lib/utils';

interface SecurityScorePanelProps {
  onOpenWizard?: () => void;
}

export function SecurityScorePanel({ onOpenWizard }: SecurityScorePanelProps) {
  const { score, issues, isLoading, isScanning, runScan, fixIssue } = useSecurityScore();
  const [fixingId, setFixingId] = useState<string | null>(null);

  const criticalIssues = issues.filter(i => i.severity === 'critical');
  const warningIssues = issues.filter(i => i.severity === 'warning');

  const getScoreColor = () => {
    if (score >= 80) return 'text-green-400';
    if (score >= 50) return 'text-yellow-400';
    return 'text-red-400';
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
    <div className={cn(
      "card-blue glass-card p-6 h-full",
      "hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-300"
    )}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <IconContainer color="blue" size="md">
            <Shield className="w-5 h-5" />
          </IconContainer>
          <div>
            <h3 className="font-semibold">Security Score</h3>
            <p className="text-sm text-muted-foreground">Credential analysis</p>
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={runScan}
              disabled={isScanning}
              className="border-blue-500/30 hover:bg-blue-500/10"
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", isScanning && "animate-spin")} />
              Scan
            </Button>
          </TooltipTrigger>
          <TooltipContent>Run security vulnerability scan</TooltipContent>
        </Tooltip>
      </div>

      {/* Score Display */}
      <div className="flex items-center gap-6 mb-6">
        <div className="text-center">
          <p className={cn("text-4xl font-bold", getScoreColor())}>{score}</p>
          <p className="text-sm text-muted-foreground">/100</p>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className={cn("text-sm font-medium", getScoreColor())}>{getScoreLabel()}</span>
            <span className="text-xs text-muted-foreground">{issues.length} issues found</span>
          </div>
          <div className="h-2 bg-blue-500/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      </div>

      {/* Critical Issues */}
      {criticalIssues.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-red-400 mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            CRITICAL ({criticalIssues.length})
          </p>
          <div className="space-y-2">
            {criticalIssues.slice(0, 2).map((issue) => (
              <div 
                key={issue.id}
                className="p-3 rounded-lg bg-red-500/10 border border-red-500/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{issue.provider} API</p>
                    <p className="text-xs text-muted-foreground">{issue.message}</p>
                  </div>
                  {issue.canAutoFix && (
                    <Tooltip>
                      <TooltipTrigger asChild>
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
                      </TooltipTrigger>
                      <TooltipContent>Automatically fix this security issue</TooltipContent>
                    </Tooltip>
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
          <p className="text-xs font-medium text-yellow-400 mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            WARNINGS ({warningIssues.length})
          </p>
          <div className="space-y-2">
            {warningIssues.slice(0, 2).map((issue) => (
              <div 
                key={issue.id}
                className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30"
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
        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-green-400" />
          <div>
            <p className="font-medium text-green-400">All credentials secured</p>
            <p className="text-xs text-muted-foreground">No security issues detected</p>
          </div>
        </div>
      )}

      {/* Run Full Wizard */}
      {issues.length > 0 && onOpenWizard && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              className="w-full mt-4 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600" 
              onClick={onOpenWizard}
            >
              <Shield className="w-4 h-4 mr-2" />
              Run Security Wizard
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open the security hardening wizard</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
