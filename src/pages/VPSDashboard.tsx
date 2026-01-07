import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Server, 
  RefreshCw, 
  Settings, 
  Plus,
  ArrowLeft,
  DollarSign,
  Activity
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useRealtimeMesh } from '@/hooks/useRealtimeMesh';
import { useVPSStatusPolling } from '@/hooks/useVPSStatusPolling';
import { InstanceCard } from '@/components/vps/InstanceCard';
import { InstanceDetails } from '@/components/vps/InstanceDetails';
import { cn } from '@/lib/utils';

export default function VPSDashboard() {
  const { nodes, metrics, activeProvider, isConnected, isLoading, refresh } = useRealtimeMesh();
  const { statuses, refresh: refreshStatus, isPolling } = useVPSStatusPolling();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    refresh();
    refreshStatus();
    setTimeout(() => setIsRefreshing(false), 1500);
  };

  const handleSelectInstance = (provider: string) => {
    setSelectedProvider(provider);
  };

  const handleCloseDetails = () => {
    setSelectedProvider(null);
  };

  const selectedNode = nodes.find(n => n.provider === selectedProvider);
  const selectedMetric = selectedProvider ? metrics[selectedProvider] : null;
  const selectedStatus = selectedProvider ? statuses[selectedProvider] : null;

  // Calculate totals
  const runningCount = nodes.filter(n => n.status === 'running' || n.status === 'idle').length;
  const totalNodes = nodes.length;
  
  // Estimate monthly cost (simplified - in production, pull from cost_analysis table)
  const estimatedMonthlyCost = nodes
    .filter(n => n.status === 'running' || n.status === 'idle')
    .reduce((acc, n) => {
      // Rough estimates per provider
      const costs: Record<string, number> = {
        contabo: 8,
        vultr: 24,
        digitalocean: 24,
        aws: 35,
        gcp: 30,
        azure: 32,
        oracle: 0, // Free tier
        alibaba: 25,
      };
      return acc + (costs[n.provider] || 20);
    }, 0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <Server className="h-8 w-8 text-primary animate-pulse" />
            <h1 className="text-2xl font-bold">Loading VPS Dashboard...</h1>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-48 rounded-xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <Server className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold">VPS Dashboard</h1>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs",
                    isConnected ? "bg-success/10 text-success border-success/40" : "bg-muted"
                  )}
                >
                  {isConnected ? '● Live' : '○ Connecting...'}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing || isPolling}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", (isRefreshing || isPolling) && "animate-spin")} />
                Refresh
              </Button>
              <Link to="/setup">
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add VPS
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4 bg-card/50 border-border/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Instances</p>
                <p className="text-2xl font-bold">
                  {runningCount}<span className="text-muted-foreground text-lg">/{totalNodes}</span>
                </p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 bg-card/50 border-border/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <Activity className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Primary Node</p>
                <p className="text-2xl font-bold capitalize">
                  {activeProvider || 'None'}
                </p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 bg-card/50 border-border/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <DollarSign className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Est. Monthly Cost</p>
                <p className="text-2xl font-bold">
                  ${estimatedMonthlyCost}<span className="text-muted-foreground text-sm">/mo</span>
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Instance Grid */}
        {nodes.length === 0 ? (
          <Card className="p-12 bg-card/50 border-border/50 text-center">
            <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No VPS Instances Configured</h3>
            <p className="text-muted-foreground mb-4">
              Connect a cloud provider to deploy your first HFT bot instance.
            </p>
            <Link to="/setup">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Setup Cloud Provider
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {nodes.map(node => (
              <InstanceCard
                key={node.provider}
                node={node}
                metric={metrics[node.provider]}
                liveStatus={statuses[node.provider]}
                isPrimary={node.provider === activeProvider}
                onClick={() => handleSelectInstance(node.provider)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Instance Details Side Panel */}
      {selectedNode && (
        <InstanceDetails
          node={selectedNode}
          metric={selectedMetric}
          liveStatus={selectedStatus}
          isPrimary={selectedNode.provider === activeProvider}
          onClose={handleCloseDetails}
        />
      )}
    </div>
  );
}
