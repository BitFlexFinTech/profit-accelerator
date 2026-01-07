import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Zap, 
  Clock, 
  Cpu, 
  HardDrive,
  Globe
} from 'lucide-react';
import { VPSPulseIndicator, getStatusFromVPS } from '@/components/dashboard/panels/VPSPulseIndicator';
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
}

interface VPSMetric {
  cpu_percent: number | null;
  ram_percent: number | null;
  disk_percent: number | null;
  latency_ms: number | null;
}

interface VPSLiveStatus {
  status: string;
  latencyMs: number | null;
  cpuPercent: number | null;
  memoryPercent: number | null;
  error: string | null;
}

interface InstanceCardProps {
  node: VPSNode;
  metric?: VPSMetric;
  liveStatus?: VPSLiveStatus | null;
  isPrimary?: boolean;
  onClick?: () => void;
}

const PROVIDER_CONFIG: Record<string, { icon: string; color: string }> = {
  contabo: { icon: '🌏', color: 'from-blue-500/20' },
  vultr: { icon: '🦅', color: 'from-sky-500/20' },
  aws: { icon: '☁️', color: 'from-orange-500/20' },
  digitalocean: { icon: '🌊', color: 'from-blue-600/20' },
  gcp: { icon: '🔵', color: 'from-red-500/20' },
  oracle: { icon: '🔴', color: 'from-red-600/20' },
  alibaba: { icon: '🟠', color: 'from-orange-600/20' },
  azure: { icon: '💠', color: 'from-cyan-500/20' },
};

const REGION_LABELS: Record<string, string> = {
  'ap-northeast-1': 'Tokyo',
  'sgp1': 'Singapore',
  'nrt': 'Tokyo NRT',
  'ewr': 'Newark',
  'us-east-1': 'N. Virginia',
  'asia-northeast1': 'Tokyo',
  'ap-tokyo-1': 'Tokyo',
  'eastus': 'East US',
  'japaneast': 'Japan East',
};

export function InstanceCard({ node, metric, liveStatus, isPrimary, onClick }: InstanceCardProps) {
  const providerConfig = PROVIDER_CONFIG[node.provider] || { icon: '🖥️', color: 'from-gray-500/20' };
  
  // Use live status if available, otherwise fall back to node/metric data
  const cpuPercent = liveStatus?.cpuPercent ?? metric?.cpu_percent ?? 0;
  const ramPercent = liveStatus?.memoryPercent ?? metric?.ram_percent ?? 0;
  const latencyMs = liveStatus?.latencyMs ?? metric?.latency_ms ?? node.latency_ms;
  
  const pulseStatus = getStatusFromVPS(
    node.status,
    latencyMs,
    node.consecutive_failures
  );

  const regionLabel = REGION_LABELS[node.region] || node.region || 'Unknown';

  const formatLatency = (ms?: number | null) => {
    if (!ms) return '—';
    if (ms < 50) return `${ms}ms`;
    if (ms < 100) return `${ms}ms`;
    if (ms < 150) return `${ms}ms`;
    return `${ms}ms ⚠️`;
  };

  const getLatencyColor = (ms?: number | null) => {
    if (!ms) return 'text-muted-foreground';
    if (ms < 50) return 'text-success';
    if (ms < 100) return 'text-primary';
    if (ms < 150) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <Card 
      className={cn(
        "relative p-4 cursor-pointer transition-all hover:shadow-lg hover:border-primary/50",
        "bg-gradient-to-br to-transparent",
        providerConfig.color,
        isPrimary && "ring-2 ring-primary/50 border-primary/50"
      )}
      onClick={onClick}
    >
      {/* Primary Badge */}
      {isPrimary && (
        <div className="absolute -top-2 -right-2">
          <Badge className="bg-primary text-primary-foreground text-xs px-2 py-0.5 shadow-lg">
            <Zap className="h-3 w-3 mr-1" />
            PRIMARY
          </Badge>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{providerConfig.icon}</span>
          <div>
            <p className="font-semibold capitalize">{node.provider}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Globe className="h-3 w-3" />
              {regionLabel}
            </div>
          </div>
        </div>
        <VPSPulseIndicator status={pulseStatus} latencyMs={latencyMs} size="lg" />
      </div>

      {/* IP Address */}
      {node.outbound_ip && (
        <p className="text-xs font-mono text-muted-foreground mb-3 truncate">
          {node.outbound_ip}
        </p>
      )}

      {/* Metrics */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground w-8">CPU</span>
          <Progress value={cpuPercent} className="h-1.5 flex-1" />
          <span className="text-xs font-mono w-10 text-right">{cpuPercent}%</span>
        </div>
        <div className="flex items-center gap-2">
          <HardDrive className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground w-8">RAM</span>
          <Progress value={ramPercent} className="h-1.5 flex-1" />
          <span className="text-xs font-mono w-10 text-right">{ramPercent}%</span>
        </div>
      </div>

      {/* Latency */}
      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Latency
        </span>
        <span className={cn("text-xs font-mono font-medium", getLatencyColor(latencyMs))}>
          {formatLatency(latencyMs)}
        </span>
      </div>

      {/* Error State */}
      {liveStatus?.error && (
        <div className="mt-2 text-xs text-destructive bg-destructive/10 rounded px-2 py-1 truncate">
          {liveStatus.error}
        </div>
      )}
    </Card>
  );
}
