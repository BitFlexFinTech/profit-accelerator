import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, ArrowRight, Zap, Hand } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface FailoverEvent {
  id: string;
  from_provider: string;
  to_provider: string;
  reason: string | null;
  is_automatic: boolean | null;
  triggered_at: string | null;
  resolved_at: string | null;
}

export function FailoverHistoryPanel() {
  const [events, setEvents] = useState<FailoverEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      const { data, error } = await supabase
        .from('failover_events')
        .select('*')
        .order('triggered_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setEvents(data);
      }
      setIsLoading(false);
    };

    fetchEvents();

    // Subscribe to new events
    const channel = supabase
      .channel('failover-history')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'failover_events'
      }, (payload) => {
        setEvents(prev => [payload.new as FailoverEvent, ...prev].slice(0, 20));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getReasonLabel = (reason: string | null) => {
    switch (reason) {
      case 'auto_health_check_failure':
        return 'Health Check Failed';
      case 'latency_threshold_exceeded':
        return 'High Latency';
      case 'manual':
        return 'Manual Switch';
      default:
        return reason || 'Unknown';
    }
  };

  if (isLoading) {
    return (
      <Card className="p-4 bg-card/50 border-border/50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <History className="h-4 w-4 animate-pulse" />
          <span className="text-sm">Loading failover history...</span>
        </div>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card className="p-4 bg-card/50 border-border/50">
        <div className="flex items-center gap-2 mb-3">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Failover History</h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-4">
          No failover events recorded yet
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-card/50 border-border/50">
      <div className="flex items-center gap-2 mb-3">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Failover History</h3>
        <Badge variant="outline" className="ml-auto text-xs">
          {events.length} events
        </Badge>
      </div>

      <ScrollArea className="h-[200px]">
        <div className="space-y-2">
          {events.map(event => (
            <div
              key={event.id}
              className="p-3 rounded-lg bg-secondary/30 border border-border/30"
            >
              <div className="flex items-center gap-2 mb-1">
                {event.is_automatic ? (
                  <Zap className="h-3 w-3 text-warning" />
                ) : (
                  <Hand className="h-3 w-3 text-primary" />
                )}
                <span className="text-sm font-medium capitalize">{event.from_provider}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-sm font-medium capitalize">{event.to_provider}</span>
                <Badge 
                  variant="outline" 
                  className={`ml-auto text-xs ${event.is_automatic ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'}`}
                >
                  {event.is_automatic ? 'Auto' : 'Manual'}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{getReasonLabel(event.reason)}</span>
                <span>
                  {event.triggered_at 
                    ? formatDistanceToNow(new Date(event.triggered_at), { addSuffix: true })
                    : 'Unknown time'
                  }
                </span>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}
