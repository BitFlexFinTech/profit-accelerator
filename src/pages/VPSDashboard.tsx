import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Server, 
  RefreshCw, 
  Plus,
  ArrowLeft,
  DollarSign,
  Activity,
  Bell,
  LayoutGrid
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useVPSInstances } from '@/hooks/useVPSInstances';
import { ServerManagementCard } from '@/components/vps/ServerManagementCard';
import { LogViewerModal } from '@/components/vps/LogViewerModal';
import { SSHTerminalModal } from '@/components/vps/SSHTerminalModal';
import { CostTrackingDashboard } from '@/components/dashboard/panels/CostTrackingDashboard';
import { VPSAlertConfig } from '@/components/dashboard/panels/VPSAlertConfig';
import { VPSInstance } from '@/types/cloudCredentials';
import { cn } from '@/lib/utils';

export default function VPSDashboard() {
  const { instances, loading, error, refetch, getTotalStats } = useVPSInstances();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [logViewerInstance, setLogViewerInstance] = useState<VPSInstance | null>(null);
  const [sshTerminalInstance, setSSHTerminalInstance] = useState<VPSInstance | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  // Calculate totals from real data
  const totalStats = getTotalStats();
  const runningCount = totalStats.runningCount;
  const totalNodes = totalStats.instanceCount;
  const estimatedMonthlyCost = totalStats.totalMonthlyCost;
  
  // Find primary node (first running instance)
  const primaryNode = instances.find(i => i.status === 'running');
  const activeProvider = primaryNode?.provider || null;

  if (loading) {
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
                    instances.length > 0 ? "bg-success/10 text-success border-success/40" : "bg-muted"
                  )}
                >
                  {instances.length > 0 ? `● ${runningCount} Live` : '○ No Instances'}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
                Refresh
              </Button>
              <Link to="/vps-setup">
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
                  ${estimatedMonthlyCost.toFixed(2)}<span className="text-muted-foreground text-sm">/mo</span>
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs for Instances, Costs, Alerts */}
        <Tabs defaultValue="instances" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="instances" className="gap-2">
              <LayoutGrid className="h-4 w-4" />
              Instances
            </TabsTrigger>
            <TabsTrigger value="costs" className="gap-2">
              <DollarSign className="h-4 w-4" />
              Costs
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-2">
              <Bell className="h-4 w-4" />
              Alerts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="instances">
            {instances.length === 0 ? (
              <Card className="p-12 bg-card/50 border-border/50 text-center">
                <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No VPS Instances Configured</h3>
                <p className="text-muted-foreground mb-4">
                  Connect a cloud provider to deploy your first HFT bot instance.
                </p>
                <Link to="/vps-setup">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Setup Cloud Provider
                  </Button>
                </Link>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {instances.map(instance => (
                  <ServerManagementCard
                    key={instance.id}
                    instance={instance}
                    onViewLogs={setLogViewerInstance}
                    onSSH={setSSHTerminalInstance}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="costs">
            <CostTrackingDashboard />
          </TabsContent>

          <TabsContent value="alerts">
            <VPSAlertConfig />
          </TabsContent>
        </Tabs>
      </main>

      {/* Log Viewer Modal */}
      {logViewerInstance && (
        <LogViewerModal
          instance={logViewerInstance}
          onClose={() => setLogViewerInstance(null)}
        />
      )}

      {/* SSH Terminal Modal */}
      {sshTerminalInstance && (
        <SSHTerminalModal
          instance={sshTerminalInstance}
          onClose={() => setSSHTerminalInstance(null)}
        />
      )}
    </div>
  );
}
