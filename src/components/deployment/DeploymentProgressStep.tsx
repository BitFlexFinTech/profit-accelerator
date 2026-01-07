import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, Clock, Loader2, AlertTriangle, Terminal } from 'lucide-react';
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
  config: {
    region: string;
    size: string;
    repoUrl: string;
    branch: string;
    envVars: Record<string, string>;
    startCommand: string;
    allowedPorts?: number[];
    enableMonitoring: boolean;
    enableBackups: boolean;
  };
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

interface DeploymentLog {
  id: string;
  deployment_id: string;
  stage_number: number | null;
  status: string | null;
  progress: number | null;
  message: string | null;
  error_details: string | null;
}

export function DeploymentProgressStep({
  provider,
  deploymentId,
  config,
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
  const [isComplete, setIsComplete] = useState(false);
  
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Timer for elapsed time
  useEffect(() => {
    const timer = setInterval(() => {
      if (!isComplete && !error) {
        setElapsedTime(prev => prev + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isComplete, error]);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Subscribe to real-time updates and start deployment
  useEffect(() => {
    const addLog = (message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    };

    // Subscribe to deployment logs via Supabase Realtime
    const channel = supabase
      .channel(`deployment-${deploymentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'deployment_logs',
          filter: `deployment_id=eq.${deploymentId}`,
        },
        (payload) => {
          const log = payload.new as DeploymentLog;
          console.log('Deployment log received:', log);

          if (log.stage_number && log.stage_number > 0) {
            setCurrentStage(log.stage_number);
            
            const status = log.status === 'completed' ? 'success' 
              : log.status === 'error' ? 'error' 
              : log.status === 'running' ? 'running' 
              : 'pending';

            setStages(prev => prev.map(s => {
              if (s.number === log.stage_number) {
                return { ...s, status, message: log.message || undefined };
              }
              if (s.number < (log.stage_number || 0) && s.status !== 'success') {
                return { ...s, status: 'success', progress: 100 };
              }
              return s;
            }));
          }

          if (log.message) {
            addLog(log.message);
          }

          if (log.progress !== null) {
            setOverallProgress(log.progress);
          }

          if (log.status === 'error') {
            setError(log.error_details || log.message || 'Deployment failed');
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    // Start the deployment
    const startDeployment = async () => {
      try {
        addLog(`Connecting to ${provider.toUpperCase()} API...`);
        
        const { data, error: invokeError } = await supabase.functions.invoke('deploy-bot', {
          body: {
            deploymentId,
            provider,
            region: config.region,
            size: config.size,
            repoUrl: config.repoUrl,
            branch: config.branch,
            envVars: config.envVars,
            startCommand: config.startCommand,
            allowedPorts: config.allowedPorts,
            enableMonitoring: config.enableMonitoring,
            enableBackups: config.enableBackups,
          },
        });

        if (invokeError) {
          throw new Error(invokeError.message);
        }

        if (data?.success) {
          setIsComplete(true);
          onComplete({
            instanceId: data.instanceId,
            ipAddress: data.ipAddress,
            provider,
            region: config.region,
            size: config.size,
            monthlyCost: data.monthlyCost || 45,
            botPid: data.botPid,
            deploymentId,
          });
        } else if (data?.error) {
          setError(data.error);
          onError(data.error);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Deployment failed';
        setError(message);
        onError(message);
      }
    };

    startDeployment();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [provider, deploymentId, config, onComplete, onError]);

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
          <div className="flex items-center gap-2 mb-2 text-green-400">
            <Terminal className="h-4 w-4" />
            <span className="text-xs font-medium">Live Logs</span>
          </div>
          <ScrollArea className="h-[120px]">
            <div className="font-mono text-xs text-green-400 space-y-1">
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
              <div ref={logEndRef} />
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
            <Button variant="destructive" size="sm" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Cancel Button */}
      {!error && !isComplete && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={onCancel}>
            Cancel Deployment
          </Button>
        </div>
      )}
    </div>
  );
}
