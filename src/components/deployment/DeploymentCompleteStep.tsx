import { Copy, ExternalLink, Terminal, Eye, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DeploymentResult } from './DeploymentWizard';
import { PROVIDER_CONFIGS } from '@/types/cloudCredentials';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface DeploymentCompleteStepProps {
  result: DeploymentResult;
  onClose: () => void;
  onDeployAnother: () => void;
}

export function DeploymentCompleteStep({ result, onClose, onDeployAnother }: DeploymentCompleteStepProps) {
  const navigate = useNavigate();
  const providerConfig = PROVIDER_CONFIGS.find(p => p.name === result.provider);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <div className="space-y-6">
      {/* Success Header */}
      <div className="text-center py-4">
        <div className="text-5xl mb-3">🎉</div>
        <h3 className="text-xl font-bold text-green-500">Server Deployed Successfully!</h3>
        <p className="text-muted-foreground mt-1">
          Your HFT trading bot is now running and will restart automatically on crashes.
        </p>
      </div>

      {/* Server Information */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <h4 className="font-semibold flex items-center gap-2">
            Server Information
            <Badge className={cn(providerConfig?.color, providerConfig?.textColor)}>
              {providerConfig?.displayName}
            </Badge>
          </h4>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Instance ID:</span>
              <div className="flex items-center gap-1 font-mono">
                <span>{result.instanceId}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => copyToClipboard(result.instanceId, 'Instance ID')}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">IP Address:</span>
              <div className="flex items-center gap-1 font-mono">
                <span>{result.ipAddress}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => copyToClipboard(result.ipAddress, 'IP Address')}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Region:</span>
              <div className="font-mono">{result.region}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Specs:</span>
              <div className="font-mono">{result.size}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Monthly Cost:</span>
              <div className="font-mono text-green-500">${result.monthlyCost}/mo</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bot Information */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h4 className="font-semibold">Bot Information</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Status:</span>
              <div className="flex items-center gap-1">
                <span className="text-green-500">🟢 Running</span>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Process ID:</span>
              <div className="font-mono">{result.botPid}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={() => navigate('/vps-dashboard')}>
          <Eye className="h-4 w-4 mr-2" />
          View Live Logs
        </Button>
        <Button variant="outline" onClick={() => navigate('/vps-dashboard')}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Open Dashboard
        </Button>
        <Button variant="outline" onClick={() => navigate('/vps-dashboard')}>
          <Terminal className="h-4 w-4 mr-2" />
          SSH Terminal
        </Button>
        <Button onClick={onDeployAnother}>
          <Plus className="h-4 w-4 mr-2" />
          Deploy Another
        </Button>
      </div>

      {/* Close Button */}
      <div className="flex justify-center pt-2">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
