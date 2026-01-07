import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Provider, DEPLOYMENT_STAGES } from '@/types/cloudCredentials';
import { DeploymentResult } from './DeploymentWizard';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface DeploymentProgressStepProps {
  provider: Provider;
  deploymentId: string;
  onComplete: (result: DeploymentResult) => void;
  onError: (error: string) => void;
  onCancel: () => void;
}

interface StageState {
  number: number;
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  progress: number;
}

export function DeploymentProgressStep({
  provider,
  deploymentId,
  onComplete,
  onError,
  onCancel,
}: DeploymentProgressStepProps) {
  const [stages, setStages] = useState<StageState[]>(
    DEPLOYMENT_STAGES.map(s => ({
      number: s.number,
      name: s.name,
      status: 'pending',
      progress: 0,
    }))
  );
  const [currentStage, setCurrentStage] = useState(1);
  const [logs, setLogs] = useState<string[]>(['[INFO] Starting deployment...']);
  const [overallProgress, setOverallProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Timer for elapsed time
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Simulated deployment (in production, this would listen to Supabase Realtime)
  useEffect(() => {
    const runDeployment = async () => {
      try {
        // Call the deploy-bot edge function
        const { data, error } = await supabase.functions.invoke('deploy-bot', {
          body: { provider, deploymentId },
        });

        if (error) throw error;

        // For now, simulate progress since edge function may not stream
        for (let i = 0; i < DEPLOYMENT_STAGES.length; i++) {
          const stage = DEPLOYMENT_STAGES[i];
          
          setCurrentStage(stage.number);
          setStages(prev => prev.map(s => 
            s.number === stage.number 
              ? { ...s, status: 'running', progress: 0 }
              : s
          ));
          
          setLogs(prev => [...prev, `[${stage.number}/18] ${stage.name}...`]);
          
          // Simulate progress
          await new Promise(r => setTimeout(r, stage.estimatedSeconds * 50));
          
          setStages(prev => prev.map(s => 
            s.number === stage.number 
              ? { ...s, status: 'success', progress: 100 }
              : s
          ));
          
          setOverallProgress(Math.round((stage.number / 18) * 100));
          setLogs(prev => [...prev, `✅ ${stage.name} complete`]);
        }

        // Complete
        onComplete({
          instanceId: data?.instanceId || `${provider}-${Date.now()}`,
          ipAddress: data?.ipAddress || '192.168.1.100',
          provider,
          region: data?.region || 'us-east-1',
          size: data?.size || 'medium',
          monthlyCost: data?.monthlyCost || 45,
          botPid: data?.botPid || 1234,
          deploymentId,
        });
      } catch (err: any) {
        setError(err.message || 'Deployment failed');
        onError(err.message);
      }
    };

    runDeployment();
  }, [provider, deploymentId, onComplete, onError]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStageIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Overall Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Overall Progress</span>
          <span>{overallProgress}%</span>
        </div>
        <Progress value={overallProgress} className="h-3" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Elapsed: {formatTime(elapsedTime)}</span>
          <span>Stage {currentStage}/18</span>
        </div>
      </div>

      {/* Stages List */}
      <ScrollArea className="h-[300px] border rounded-lg p-3">
        <div className="space-y-2">
          {stages.map(stage => (
            <div
              key={stage.number}
              className={cn(
                "flex items-center gap-3 p-2 rounded",
                stage.status === 'running' && "bg-blue-500/10",
                stage.status === 'success' && "bg-green-500/5",
                stage.status === 'error' && "bg-red-500/10"
              )}
            >
              {getStageIcon(stage.status)}
              <span className="text-sm flex-1">
                {stage.number}. {stage.name}
              </span>
              {stage.status === 'running' && (
                <span className="text-xs text-muted-foreground">In progress...</span>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Logs Terminal */}
      <Card className="bg-black/90">
        <CardContent className="p-3">
          <ScrollArea className="h-[120px]">
            <div className="font-mono text-xs text-green-400 space-y-1">
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-red-500">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">Deployment Failed</span>
          </div>
          <p className="text-sm text-red-400 mt-2">{error}</p>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm">
              Retry
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
