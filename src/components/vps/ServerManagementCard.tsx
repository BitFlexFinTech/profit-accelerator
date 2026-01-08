import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Cpu,
  HardDrive,
  Clock,
  Globe,
  MoreVertical,
  Terminal,
  RefreshCw,
  Power,
  Trash2,
  FileText,
  Copy,
  Check,
  Pencil,
  DollarSign,
  Activity,
  Play,
  Square,
} from 'lucide-react';
import { VPSInstance, Provider } from '@/types/cloudCredentials';
import { useVPSInstances } from '@/hooks/useVPSInstances';
import { useVPSMetrics } from '@/hooks/useVPSMetrics';
import { cn } from '@/lib/utils';
import { ActionButton } from '@/components/ui/ActionButton';
import { BUTTON_TOOLTIPS } from '@/config/buttonTooltips';

interface ServerManagementCardProps {
  instance: VPSInstance;
  onViewLogs: (instance: VPSInstance) => void;
  onSSH: (instance: VPSInstance) => void;
}

const PROVIDER_CONFIG: Record<Provider, { icon: string; color: string; bgColor: string }> = {
  aws: { icon: '☁️', color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  digitalocean: { icon: '🌊', color: 'text-cyan-500', bgColor: 'bg-cyan-500/10' },
  vultr: { icon: '🦅', color: 'text-fuchsia-500', bgColor: 'bg-fuchsia-500/10' },
  contabo: { icon: '🔷', color: 'text-lime-500', bgColor: 'bg-lime-500/10' },
  oracle: { icon: '🔴', color: 'text-red-600', bgColor: 'bg-red-600/10' },
  gcp: { icon: '🔵', color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  alibaba: { icon: '🟠', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' },
  azure: { icon: '💠', color: 'text-sky-400', bgColor: 'bg-sky-400/10' },
};

const STATUS_CONFIG: Record<string, { color: string; bgColor: string; label: string }> = {
  running: { color: 'text-success', bgColor: 'bg-success/10', label: 'Running' },
  stopped: { color: 'text-destructive', bgColor: 'bg-destructive/10', label: 'Stopped' },
  creating: { color: 'text-warning', bgColor: 'bg-warning/10', label: 'Creating' },
  rebooting: { color: 'text-orange-500', bgColor: 'bg-orange-500/10', label: 'Rebooting' },
  error: { color: 'text-destructive', bgColor: 'bg-destructive/10', label: 'Error' },
  pending: { color: 'text-muted-foreground', bgColor: 'bg-muted', label: 'Pending' },
};

const BOT_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  running: { color: 'text-success', label: 'Bot Running' },
  stopped: { color: 'text-destructive', label: 'Bot Stopped' },
  pending: { color: 'text-warning', label: 'Bot Starting...' },
  error: { color: 'text-destructive', label: 'Bot Error' },
};

export function ServerManagementCard({ instance, onViewLogs, onSSH }: ServerManagementCardProps) {
  const { restartBot, rebootServer, deleteInstance, updateInstanceNickname } = useVPSInstances();
  const { metrics } = useVPSMetrics();
  const [isEditingName, setIsEditingName] = useState(false);
  const [nickname, setNickname] = useState(instance.nickname || '');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isRebooting, setIsRebooting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [copied, setCopied] = useState(false);

  // Get real metrics for this instance's provider
  const instanceMetrics = metrics.find(m => m.provider === instance.provider);
  const cpuPercent = instanceMetrics?.cpu_percent ?? 0;
  const ramPercent = instanceMetrics?.ram_percent ?? 0;
  const latencyMs = instanceMetrics?.latency_ms;
  const uptimeFromMetrics = instanceMetrics?.uptime_seconds ?? instance.uptimeSeconds;

  const providerConfig = PROVIDER_CONFIG[instance.provider];
  const statusConfig = STATUS_CONFIG[instance.status] || STATUS_CONFIG.pending;
  const botStatusConfig = BOT_STATUS_CONFIG[instance.botStatus] || BOT_STATUS_CONFIG.pending;

  const handleCopyIP = async () => {
    if (instance.ipAddress) {
      await navigator.clipboard.writeText(instance.ipAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveNickname = async () => {
    if (nickname.trim() && nickname !== instance.nickname) {
      await updateInstanceNickname(instance.id, nickname.trim());
    }
    setIsEditingName(false);
  };

  const handleRestartBot = async () => {
    setIsRestarting(true);
    await restartBot(instance.id);
    setIsRestarting(false);
  };

  const handleRebootServer = async () => {
    setIsRebooting(true);
    await rebootServer(instance.id);
    setIsRebooting(false);
  };

  const handleStartBot = async () => {
    setIsStarting(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      await supabase.functions.invoke('bot-control', {
        body: { action: 'start', deploymentId: instance.id },
      });
    } catch (err) {
      console.error('Failed to start bot:', err);
    }
    setIsStarting(false);
  };

  const handleStopBot = async () => {
    setIsStopping(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      await supabase.functions.invoke('bot-control', {
        body: { action: 'stop', deploymentId: instance.id },
      });
    } catch (err) {
      console.error('Failed to stop bot:', err);
    }
    setIsStopping(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    await deleteInstance(instance.id, instance.provider);
    setIsDeleting(false);
    setIsDeleteDialogOpen(false);
  };

  const formatUptime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  return (
    <>
      <Card className={cn(
        "relative p-4 transition-all hover:shadow-lg border-border/50",
        "bg-gradient-to-br from-card to-card/80",
        instance.status === 'running' && "border-success/30"
      )}>
        {/* Header: Provider + Status */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn("p-2 rounded-lg", providerConfig.bgColor)}>
              <span className="text-xl">{providerConfig.icon}</span>
            </div>
            <div className="min-w-0">
              {isEditingName ? (
                <Input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  onBlur={handleSaveNickname}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveNickname()}
                  className="h-6 text-sm font-semibold px-1"
                  autoFocus
                />
              ) : (
                <div className="flex items-center gap-1 group">
                  <p className="font-semibold truncate">
                    {instance.nickname || `${instance.provider}-${instance.region}`}
                  </p>
                  <ActionButton
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setIsEditingName(true)}
                    tooltip={BUTTON_TOOLTIPS.editName}
                  >
                    <Pencil className="h-3 w-3" />
                  </ActionButton>
                </div>
              )}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Globe className="h-3 w-3" />
                <span className="capitalize">{instance.provider}</span>
                <span>•</span>
                <span>{instance.region}</span>
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onViewLogs(instance)}>
                <FileText className="h-4 w-4 mr-2" />
                View Logs
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSSH(instance)}>
                <Terminal className="h-4 w-4 mr-2" />
                SSH Terminal
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleRestartBot} disabled={isRestarting}>
                <RefreshCw className={cn("h-4 w-4 mr-2", isRestarting && "animate-spin")} />
                Restart Bot
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRebootServer} disabled={isRebooting}>
                <Power className={cn("h-4 w-4 mr-2", isRebooting && "animate-spin")} />
                Reboot Server
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => setIsDeleteDialogOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Instance
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Status Badges */}
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="outline" className={cn(statusConfig.bgColor, statusConfig.color, "text-xs")}>
            {statusConfig.label}
          </Badge>
          <Badge variant="outline" className={cn("text-xs", botStatusConfig.color)}>
            {botStatusConfig.label}
          </Badge>
        </div>

        {/* IP Address */}
        {instance.ipAddress && (
          <div className="flex items-center gap-2 mb-3 p-2 rounded-md bg-muted/50">
            <code className="text-xs font-mono flex-1 truncate">{instance.ipAddress}</code>
            <ActionButton
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleCopyIP}
              tooltip={BUTTON_TOOLTIPS.copyIP}
            >
              {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
            </ActionButton>
          </div>
        )}

        {/* Metrics */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground w-8">CPU</span>
            <Progress value={cpuPercent} className="h-1.5 flex-1" />
            <span className="text-xs font-mono w-10 text-right">
              {cpuPercent > 0 ? `${cpuPercent.toFixed(0)}%` : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <HardDrive className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground w-8">RAM</span>
            <Progress value={ramPercent} className="h-1.5 flex-1" />
            <span className="text-xs font-mono w-10 text-right">
              {ramPercent > 0 ? `${ramPercent.toFixed(0)}%` : '—'}
            </span>
          </div>
          {latencyMs !== null && latencyMs !== undefined && (
            <div className="flex items-center gap-2">
              <Activity className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground w-8">Ping</span>
              <div className="flex-1" />
              <span className={cn(
                "text-xs font-mono w-16 text-right",
                latencyMs < 50 ? "text-success" : latencyMs < 200 ? "text-warning" : "text-destructive"
              )}>
                {latencyMs}ms
              </span>
            </div>
          )}
        </div>

        {/* Footer: Uptime + Cost */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>Uptime: {formatUptime(uptimeFromMetrics)}</span>
          </div>
          <div className="flex items-center gap-1 font-medium">
            <DollarSign className="h-3 w-3" />
            <span>${instance.monthlyCost}/mo</span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
          <ActionButton
            variant="outline"
            size="sm"
            className="flex-1 text-xs h-8"
            onClick={() => onViewLogs(instance)}
            tooltip={BUTTON_TOOLTIPS.viewLogs}
          >
            <FileText className="h-3 w-3 mr-1" />
            Logs
          </ActionButton>
          <ActionButton
            variant="outline"
            size="sm"
            className="flex-1 text-xs h-8"
            onClick={() => onSSH(instance)}
            tooltip={BUTTON_TOOLTIPS.viewSSH}
          >
            <Terminal className="h-3 w-3 mr-1" />
            SSH
          </ActionButton>
          <ActionButton
            variant="outline"
            size="sm"
            className="text-xs h-8 px-2"
            onClick={handleStartBot}
            disabled={isStarting || instance.botStatus === 'running'}
            tooltip={BUTTON_TOOLTIPS.startBot}
          >
            <Play className={cn("h-3 w-3 text-success", isStarting && "animate-pulse")} />
          </ActionButton>
          <ActionButton
            variant="outline"
            size="sm"
            className="text-xs h-8 px-2"
            onClick={handleStopBot}
            disabled={isStopping || instance.botStatus === 'stopped'}
            tooltip={BUTTON_TOOLTIPS.stopBot}
          >
            <Square className={cn("h-3 w-3 text-destructive", isStopping && "animate-pulse")} />
          </ActionButton>
          <ActionButton
            variant="outline"
            size="sm"
            className="text-xs h-8 px-2"
            onClick={handleRestartBot}
            disabled={isRestarting}
            tooltip={BUTTON_TOOLTIPS.restartBot}
          >
            <RefreshCw className={cn("h-3 w-3", isRestarting && "animate-spin")} />
          </ActionButton>
        </div>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete VPS Instance?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently destroy the server at <strong>{instance.ipAddress}</strong> and 
              remove it from your dashboard. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Instance
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
