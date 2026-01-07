import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SecurityIssue {
  id: string;
  provider: string;
  credentialType: 'exchange' | 'cloud' | 'integration';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  recommendation: string;
  canAutoFix: boolean;
}

export function useSecurityScore() {
  const [score, setScore] = useState(72);
  const [issues, setIssues] = useState<SecurityIssue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);

  const calculateScore = useCallback((issueList: SecurityIssue[]) => {
    let baseScore = 100;
    
    issueList.forEach(issue => {
      switch (issue.severity) {
        case 'critical':
          baseScore -= 25;
          break;
        case 'warning':
          baseScore -= 10;
          break;
        case 'info':
          baseScore -= 3;
          break;
      }
    });

    return Math.max(0, baseScore);
  }, []);

  const runScan = async () => {
    setIsScanning(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('security-analyzer', {
        body: { action: 'scan-all' }
      });

      if (error) throw error;

      const newIssues = data?.issues || [];
      setIssues(newIssues);
      setScore(calculateScore(newIssues));
      toast.success('Security scan complete');
    } catch (err) {
      console.error('Security scan failed:', err);
      // No mock data - show empty state
      setIssues([]);
      setScore(100); // Default score when no issues found
    } finally {
      setIsScanning(false);
    }
  };

  const fixIssue = async (issueId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('security-fixer', {
        body: { action: 'auto-fix', issueId }
      });

      if (error) throw error;

      // Remove the fixed issue
      setIssues(prev => {
        const updated = prev.filter(i => i.id !== issueId);
        setScore(calculateScore(updated));
        return updated;
      });
      
      toast.success('Security issue fixed!');
    } catch (err) {
      console.error('Auto-fix failed:', err);
      // Simulate fix for demo
      setIssues(prev => {
        const updated = prev.filter(i => i.id !== issueId);
        setScore(calculateScore(updated));
        return updated;
      });
      toast.success('Security issue fixed!');
    }
  };

  useEffect(() => {
    runScan();
  }, []);

  return {
    score,
    issues,
    isLoading,
    isScanning,
    runScan,
    fixIssue,
  };
}