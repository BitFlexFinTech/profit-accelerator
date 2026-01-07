import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCloudInfrastructure, PROVIDER_ICONS } from '@/hooks/useCloudInfrastructure';
import { 
  Clock, 
  Rocket, 
  Heart, 
  AlertTriangle, 
  XCircle, 
  Zap, 
  DollarSign, 
  BarChart3,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const EVENT_ICONS: Record<string, React.ReactNode> = {
  deployment: <Rocket className="h-4 w-4 text-primary" />,
  health_check: <Heart className="h-4 w-4 text-success" />,
  failover: <Zap className="h-4 w-4 text-warning" />,
  cost_optimization: <DollarSign className="h-4 w-4 text-success" />,
  benchmark: <BarChart3 className="h-4 w-4 text-accent" />,
};

const SUBTYPE_ICONS: Record<string, React.ReactNode> = {
  started: <Clock className="h-3 w-3 text-primary" />,
  completed: <Heart className="h-3 w-3 text-success" />,
  failed: <XCircle className="h-3 w-3 text-destructive" />,
  warning: <AlertTriangle className="h-3 w-3 text-warning" />,
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  deployment: 'Deployment',
  health_check: 'Health Check',
  failover: 'Failover',
  cost_optimization: 'Cost Optimization',
  benchmark: 'Benchmark',
};

export function VPSDeploymentTimelinePanel() {
  const { timelineEvents, isLoading, refresh } = useCloudInfrastructure();
  const [filterType, setFilterType] = useState<string>('all');
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    refresh();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const toggleExpanded = (id: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredEvents = timelineEvents.filter(event => {
    if (filterType !== 'all' && event.event_type !== filterType) return false;
    if (filterProvider !== 'all' && event.provider !== filterProvider) return false;
    return true;
  });

  const uniqueProviders = [...new Set(timelineEvents.map(e => e.provider))];
  const uniqueTypes = [...new Set(timelineEvents.map(e => e.event_type))];

  const getEventBgColor = (event_type: string, event_subtype: string | null) => {
    if (event_subtype === 'failed') return 'bg-destructive/10 border-destructive/30';
    if (event_subtype === 'warning') return 'bg-warning/10 border-warning/30';
    if (event_type === 'failover') return 'bg-warning/10 border-warning/30';
    if (event_type === 'cost_optimization') return 'bg-success/10 border-success/30';
    return 'bg-secondary/30 border-border/30';
  };

  if (isLoading) {
    return (
      <Card className="p-6 bg-card/50 border-border/50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-5 w-5 animate-pulse" />
          <span>Loading timeline...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-card/50 border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">VPS Deployment Timeline</h3>
          <Badge variant="outline" className="text-xs">
            {filteredEvents.length} events
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="Event type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {uniqueTypes.map(type => (
              <SelectItem key={type} value={type}>
                {EVENT_TYPE_LABELS[type] || type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterProvider} onValueChange={setFilterProvider}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            {uniqueProviders.map(provider => (
              <SelectItem key={provider} value={provider}>
                {PROVIDER_ICONS[provider]} {provider}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      <ScrollArea className="h-[300px]">
        {filteredEvents.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>No timeline events recorded yet</p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical Line */}
            <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

            {/* Events */}
            <div className="space-y-3">
              {filteredEvents.map(event => {
                const isExpanded = expandedEvents.has(event.id);
                
                return (
                  <div
                    key={event.id}
                    className={cn(
                      "relative ml-10 p-3 rounded-lg border transition-all",
                      getEventBgColor(event.event_type, event.event_subtype)
                    )}
                  >
                    {/* Event Icon on Timeline */}
                    <div className="absolute -left-10 top-3 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center">
                      {EVENT_ICONS[event.event_type] || <Clock className="h-3 w-3" />}
                    </div>

                    {/* Event Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{PROVIDER_ICONS[event.provider] || '🖥️'}</span>
                          <span className="font-medium text-sm">{event.title}</span>
                          {event.event_subtype && (
                            <span className="flex items-center gap-1">
                              {SUBTYPE_ICONS[event.event_subtype]}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {event.created_at
                            ? formatDistanceToNow(new Date(event.created_at), { addSuffix: true })
                            : 'Unknown time'}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">
                          {event.event_type.replace('_', ' ')}
                        </Badge>
                        {event.description && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => toggleExpanded(event.id)}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && event.description && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <p className="text-sm text-muted-foreground">{event.description}</p>
                        {Object.keys(event.metadata || {}).length > 0 && (
                          <pre className="mt-2 p-2 rounded bg-background/50 text-xs overflow-x-auto">
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}
