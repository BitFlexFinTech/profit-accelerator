import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Provider, PROVIDER_CONFIGS } from '@/types/cloudCredentials';
import { DeploymentConfigStep } from './DeploymentConfigStep';
import { DeploymentProgressStep } from './DeploymentProgressStep';
import { DeploymentCompleteStep } from './DeploymentCompleteStep';
import { cn } from '@/lib/utils';

interface DeploymentWizardProps {
  provider: Provider;
  onClose: () => void;
}

export type WizardStep = 'config' | 'progress' | 'complete';

export interface DeploymentResult {
  instanceId: string;
  ipAddress: string;
  provider: Provider;
  region: string;
  size: string;
  monthlyCost: number;
  botPid?: number;
  deploymentId: string;
}

export function DeploymentWizard({ provider, onClose }: DeploymentWizardProps) {
  const [step, setStep] = useState<WizardStep>('config');
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [deploymentResult, setDeploymentResult] = useState<DeploymentResult | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [deploymentConfig, setDeploymentConfig] = useState<{
    region: string;
    size: string;
    repoUrl: string;
    branch: string;
    envVars: Record<string, string>;
    startCommand: string;
    allowedPorts?: number[];
    enableMonitoring: boolean;
    enableBackups: boolean;
  } | null>(null);

  const providerConfig = PROVIDER_CONFIGS.find(p => p.name === provider);

  const handleStartDeployment = (config: any) => {
    // Generate deployment ID and store config
    const id = `deploy-${provider}-${Date.now()}`;
    setDeploymentId(id);
    setDeploymentConfig({
      region: config.region || 'us-east-1',
      size: config.size || 'medium',
      repoUrl: config.repoUrl || 'https://github.com/user/hft-bot',
      branch: config.branch || 'main',
      envVars: config.envVars || {},
      startCommand: config.startCommand || 'npm start',
      allowedPorts: config.allowedPorts,
      enableMonitoring: config.enableMonitoring ?? true,
      enableBackups: config.enableBackups ?? true,
    });
    setStep('progress');
  };

  const handleDeploymentComplete = (result: DeploymentResult) => {
    setDeploymentResult(result);
    setStep('complete');
  };

  const handleDeploymentError = (error: string) => {
    setDeploymentError(error);
  };

  const handleRetry = () => {
    setDeploymentError(null);
    setStep('config');
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <span
                className={cn(
                  "px-2 py-1 rounded text-sm font-medium",
                  providerConfig?.color,
                  providerConfig?.textColor
                )}
              >
                {providerConfig?.displayName}
              </span>
              <span>
                {step === 'config' && 'Server Configuration'}
                {step === 'progress' && 'Automated Deployment'}
                {step === 'complete' && 'Deployment Complete'}
              </span>
            </DialogTitle>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center gap-2 mt-4">
            {(['config', 'progress', 'complete'] as WizardStep[]).map((s, i) => (
              <div key={s} className="flex items-center">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                    step === s
                      ? "bg-primary text-primary-foreground"
                      : ['progress', 'complete'].indexOf(step) > ['config', 'progress', 'complete'].indexOf(s)
                      ? "bg-green-500 text-white"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {i + 1}
                </div>
                {i < 2 && (
                  <div
                    className={cn(
                      "w-12 h-0.5 mx-1",
                      ['progress', 'complete'].indexOf(step) > i
                        ? "bg-green-500"
                        : "bg-muted"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="mt-4">
          {step === 'config' && (
            <DeploymentConfigStep
              provider={provider}
              onNext={handleStartDeployment}
              onCancel={onClose}
            />
          )}

          {step === 'progress' && deploymentId && deploymentConfig && (
            <DeploymentProgressStep
              provider={provider}
              deploymentId={deploymentId}
              config={deploymentConfig}
              onComplete={handleDeploymentComplete}
              onError={handleDeploymentError}
              onCancel={onClose}
            />
          )}

          {step === 'complete' && deploymentResult && (
            <DeploymentCompleteStep
              result={deploymentResult}
              onClose={onClose}
              onDeployAnother={handleRetry}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
