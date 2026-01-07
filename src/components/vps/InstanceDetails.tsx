import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { 
  X, 
  Terminal, 
  FileText, 
  Activity, 
  Power, 
  RotateCcw, 
  Trash2,
  Zap,
  Clock,
  Cpu,
  HardDrive,
  Network,
  Globe,
  AlertTriangle
} from 'lucide-react';
import { VPSPulseIndicator, getStatusFromVPS } from '@/components/dashboard/panels/VPSPulseIndicator';
import { LogViewer } from '@/components/vps/LogViewer';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface VPSNode {
  id: string;
  provider: string;
  region: string;
  status: string | null;
  outbound_ip: string | null;
  latency_ms?: number;
  is_primary?: boolean;
  consecutive_failures?: number;
  last_health_check?: string;
}

interface VPSMetric {
  cpu_percent: number | null;
  ram_percent: number | null;
  disk_percent: number | null;
  network_in_mbps: number | null;
  network_out_mbps: number | null;
  latency_ms: number | null;
  uptime_seconds: number | null;
}

interface VPSLiveStatus {
  status: string;
  latencyMs: number | null;
  cpuPercent: number | null;
  memoryPercent: number | null;
  uptimeSeconds: number | null;
  error: string | null;
}

interface InstanceDetailsProps {
  node: VPSNode;
  metric?: VPSMetric | null;
  liveStatus?: VPSLiveStatus | null;
  isPrimary?: boolean;
  onClose: () => void;
}

const PROVIDER_ICONS: Record<string, string> = {
  contabo: '🌏',
  vultr: '🦅',
  aws: '☁️',
  digitalocean: '🌊',
  gcp: '🔵',
  oracle: '🔴',
  alibaba: '🟠',
  azure: '💠',
};

export function InstanceDetails({ node, metric, liveStatus, isPrimary, onClose }: InstanceDetailsProps) {
  const [isRestarting, setIsRestarting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const cpuPercent = liveStatus?.cpuPercent ?? metric?.cpu_percent ?? 0;
  const ramPercent = liveStatus?.memoryPercent ?? metric?.ram_percent ?? 0;
  const diskPercent = metric?.disk_percent ?? 0;
  const latencyMs = liveStatus?.latencyMs ?? metric?.latency_ms ?? node.latency_ms;
  const uptimeSeconds = liveStatus?.uptimeSeconds ?? metric?.uptime_seconds;

  const pulseStatus = getStatusFromVPS(
    node.status,
    latencyMs,
    node.consecutive_failures
  );

  const formatUptime = (seconds?: number | null) => {
    if (!seconds) return '—';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const handleRestartBot = async () => {
    setIsRestarting(true);
    try {
      const { error } = await supabase.functions.invoke('provision-vps', {
        body: {
          action: 'restart-bot',
          provider: node.provider,
        }
      });

      if (error) throw error;
      toast.success('Bot restart initiated');
    } catch (err: any) {
      toast.error(`Failed to restart bot: ${err.message}`);
    } finally {
      setIsRestarting(false);
    }
  };

  const handleDeleteInstance = async () => {
    if (!confirm(`Are you sure you want to delete the ${node.provider} instance? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('provision-vps', {
        body: {
          action: 'delete-instance',
          provider: node.provider,
        }
      });

      if (error) throw error;
      toast.success('Instance deletion initiated');
      onClose();
    } catch (err: any) {
      toast.error(`Failed to delete instance: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Sheet open onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-xl lg:max-w-2xl overflow-hidden flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{PROVIDER_ICONS[node.provider] || '🖥️'}</span>
              <div>
                <SheetTitle className="capitalize text-xl">{node.provider}</SheetTitle>
                <div className="flex items-center gap-2 mt-1">
                  <VPSPulseIndicator status={pulseStatus} size="sm" showLabel />
                  {isPrimary && (
                    <Badge className="bg-primary text-primary-foreground text-xs">
                      <Zap className="h-3 w-3 mr-1" />
                      PRIMARY
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden mt-4">
          <TabsList className="flex-shrink-0 grid grid-cols-3 w-full">
            <TabsTrigger value="overview" className="text-xs">
              <Activity className="h-3 w-3 mr-1" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="logs" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              Logs
            </TabsTrigger>
            <TabsTrigger value="terminal" className="text-xs">
              <Terminal className="h-3 w-3 mr-1" />
              Terminal
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            <TabsContent value="overview" className="mt-0 space-y-4">
              {/* Instance Info */}
              <Card className="p-4 bg-secondary/30">
                <h4 className="text-sm font-medium mb-3">Instance Details</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Region:</span>
                    <span className="font-mono">{node.region}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Uptime:</span>
                    <span className="font-mono">{formatUptime(uptimeSeconds)}</span>
                  </div>
                  {node.outbound_ip && (
                    <div className="col-span-2 flex items-center gap-2">
                      <Network className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">IP:</span>
                      <span className="font-mono">{node.outbound_ip}</span>
                    </div>
                  )}
                </div>
              </Card>

              {/* Resource Metrics */}
              <Card className="p-4 bg-secondary/30">
                <h4 className="text-sm font-medium mb-3">Resource Usage</h4>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-primary" />
                        CPU
                      </span>
                      <span className="text-sm font-mono">{cpuPercent}%</span>
                    </div>
                    <Progress value={cpuPercent} className="h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm flex items-center gap-2">
                        <HardDrive className="h-4 w-4 text-success" />
                        Memory
                      </span>
                      <span className="text-sm font-mono">{ramPercent}%</span>
                    </div>
                    <Progress value={ramPercent} className="h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm flex items-center gap-2">
                        <HardDrive className="h-4 w-4 text-warning" />
                        Disk
                      </span>
                      <span className="text-sm font-mono">{diskPercent}%</span>
                    </div>
                    <Progress value={diskPercent} className="h-2" />
                  </div>
                </div>
              </Card>

              {/* Network Stats */}
              <Card className="p-4 bg-secondary/30">
                <h4 className="text-sm font-medium mb-3">Network</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-background/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Latency</p>
                    <p className={cn(
                      "text-2xl font-mono font-bold",
                      !latencyMs ? 'text-muted-foreground' :
                      latencyMs < 50 ? 'text-success' :
                      latencyMs < 100 ? 'text-primary' :
                      latencyMs < 150 ? 'text-warning' : 'text-destructive'
                    )}>
                      {latencyMs ? `${latencyMs}ms` : '—'}
                    </p>
                  </div>
                  <div className="text-center p-3 bg-background/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Network I/O</p>
                    <p className="text-sm font-mono">
                      <span className="text-success">↓ {metric?.network_in_mbps?.toFixed(1) || '0.0'}</span>
                      {' / '}
                      <span className="text-primary">↑ {metric?.network_out_mbps?.toFixed(1) || '0.0'}</span>
                      <span className="text-muted-foreground text-xs"> Mbps</span>
                    </p>
                  </div>
                </div>
              </Card>

              {/* Error Display */}
              {liveStatus?.error && (
                <Card className="p-4 bg-destructive/10 border-destructive/50">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-destructive">Error Detected</h4>
                      <p className="text-sm text-destructive/80 mt-1">{liveStatus.error}</p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Actions */}
              <Card className="p-4 bg-secondary/30">
                <h4 className="text-sm font-medium mb-3">Actions</h4>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRestartBot}
                    disabled={isRestarting || node.status === 'stopped'}
                  >
                    <RotateCcw className={cn("h-4 w-4 mr-2", isRestarting && "animate-spin")} />
                    Restart Bot
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteInstance}
                    disabled={isDeleting || isPrimary}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Instance
                  </Button>
                </div>
                {isPrimary && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Cannot delete primary instance. Switch to another node first.
                  </p>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="logs" className="mt-0">
              <LogViewer provider={node.provider} ip={node.outbound_ip} />
            </TabsContent>

            <TabsContent value="terminal" className="mt-0">
              <Card className="p-4 bg-secondary/30 h-[400px] flex items-center justify-center">
                <div className="text-center">
                  <Terminal className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">SSH Terminal</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Connect via VPS Terminal Panel in main dashboard
                  </p>
                  <Button variant="outline" size="sm" className="mt-4" asChild>
                    <a href="/" onClick={onClose}>
                      Open Dashboard Terminal
                    </a>
                  </Button>
                </div>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
