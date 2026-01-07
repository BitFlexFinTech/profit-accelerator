import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Provider, DeploymentConfig, DeploymentStage, DEPLOYMENT_STAGES } from '@/types/cloudCredentials';
import { toast } from 'sonner';

interface DeploymentLog {
  id: string;
  deployment_id: string;
  provider: string;
  stage: string | null;
  stage_number: number | null;
  status: string | null;
  progress: number | null;
  message: string | null;
  error_details: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  instance_id: string | null;
}

interface DeploymentResult {
  success: boolean;
  instanceId?: string;
  ipAddress?: string;
  deploymentId: string;
  error?: string;
}

export function useDeployment() {
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [stages, setStages] = useState<DeploymentStage[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [result, setResult] = useState<DeploymentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Initialize stages from DEPLOYMENT_STAGES
  const initializeStages = useCallback(() => {
    const initialStages: DeploymentStage[] = DEPLOYMENT_STAGES.map((stage) => ({
      number: stage.number,
      name: stage.name,
      status: 'pending',
      progress: 0,
    }));
    setStages(initialStages);
  }, []);

  // Update a specific stage
  const updateStage = useCallback(
    (stageNumber: number, status: DeploymentStage['status'], message?: string, errorDetails?: string) => {
      setStages((prev) =>
        prev.map((stage) => {
          if (stage.number === stageNumber) {
            return {
              ...stage,
              status,
              message,
              errorDetails,
              progress: status === 'success' ? 100 : status === 'running' ? 50 : stage.progress,
              startedAt: status === 'running' ? new Date() : stage.startedAt,
              completedAt: status === 'success' || status === 'error' ? new Date() : undefined,
            };
          }
          return stage;
        })
      );
    },
    []
  );

  // Add a log entry
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  // Subscribe to deployment logs
  const subscribeToDeployment = useCallback(
    (depId: string) => {
      // Clean up existing subscription
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }

      const channel = supabase
        .channel(`deployment-${depId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'deployment_logs',
            filter: `deployment_id=eq.${depId}`,
          },
          (payload) => {
            const log = payload.new as DeploymentLog;
            console.log('Deployment log received:', log);

            // Update stage
            if (log.stage_number) {
              const status =
                log.status === 'completed'
                  ? 'success'
                  : log.status === 'error'
                  ? 'error'
                  : log.status === 'running'
                  ? 'running'
                  : 'pending';
              updateStage(log.stage_number, status, log.message || undefined, log.error_details || undefined);
            }

            // Add to logs
            if (log.message) {
              addLog(log.message);
            }

            // Update overall progress
            if (log.progress !== null) {
              setOverallProgress(log.progress);
            }

            // Check for completion or error
            if (log.status === 'completed' && log.stage_number === 18) {
              setIsDeploying(false);
            } else if (log.status === 'error') {
              setError(log.error_details || log.message || 'Deployment failed');
              setIsDeploying(false);
            }
          }
        )
        .subscribe();

      channelRef.current = channel;
    },
    [updateStage, addLog]
  );

  // Start deployment
  const startDeployment = useCallback(
    async (config: DeploymentConfig): Promise<DeploymentResult> => {
      try {
        setIsDeploying(true);
        setError(null);
        setResult(null);
        setLogs([]);
        setOverallProgress(0);
        initializeStages();

        // Generate deployment ID
        const newDeploymentId = `dep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setDeploymentId(newDeploymentId);

        // Subscribe to real-time updates BEFORE starting deployment
        subscribeToDeployment(newDeploymentId);

        addLog(`Starting deployment for ${config.provider}...`);
        addLog(`Deployment ID: ${newDeploymentId}`);

        // Call the deploy-bot edge function
        const { data, error: invokeError } = await supabase.functions.invoke('deploy-bot', {
          body: {
            deploymentId: newDeploymentId,
            provider: config.provider,
            region: config.region,
            size: config.size,
            customSpecs: config.customSpecs,
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

        const deployResult: DeploymentResult = {
          success: data?.success || false,
          instanceId: data?.instanceId,
          ipAddress: data?.ipAddress,
          deploymentId: newDeploymentId,
          error: data?.error,
        };

        setResult(deployResult);

        if (!deployResult.success) {
          setError(deployResult.error || 'Deployment failed');
        }

        return deployResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Deployment failed';
        setError(message);
        setIsDeploying(false);
        toast.error(message);

        return {
          success: false,
          deploymentId: deploymentId || '',
          error: message,
        };
      }
    },
    [initializeStages, subscribeToDeployment, addLog, deploymentId]
  );

  // Cancel deployment
  const cancelDeployment = useCallback(async () => {
    if (!deploymentId) return;

    try {
      // Call cleanup endpoint
      await supabase.functions.invoke('deploy-bot', {
        body: {
          action: 'cancel',
          deploymentId,
        },
      });

      setIsDeploying(false);
      setError('Deployment cancelled');
      addLog('Deployment cancelled by user');
      toast.info('Deployment cancelled');
    } catch (err) {
      console.error('Error cancelling deployment:', err);
    }
  }, [deploymentId, addLog]);

  // Retry deployment
  const retryDeployment = useCallback(
    async (config: DeploymentConfig) => {
      setError(null);
      return startDeployment(config);
    },
    [startDeployment]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  // Get deployment logs from database
  const fetchDeploymentLogs = useCallback(async (depId: string): Promise<DeploymentLog[]> => {
    const { data, error: fetchError } = await supabase
      .from('deployment_logs')
      .select('*')
      .eq('deployment_id', depId)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('Error fetching deployment logs:', fetchError);
      return [];
    }

    return data || [];
  }, []);

  return {
    isDeploying,
    deploymentId,
    stages,
    logs,
    overallProgress,
    result,
    error,
    startDeployment,
    cancelDeployment,
    retryDeployment,
    fetchDeploymentLogs,
  };
}
