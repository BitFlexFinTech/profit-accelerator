import { useState, useEffect } from 'react';
import { Bell, AlertTriangle, Info, CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface Alert {
  id: string;
  alert_type: string;
  message: string | null;
  severity: string | null;
  sent_at: string | null;
  acknowledged_at: string | null;
}

export function NotificationDropdown() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const fetchAlerts = async () => {
    const { data, error } = await supabase
      .from('alert_history')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      setAlerts(data);
      setUnreadCount(data.filter(a => !a.acknowledged_at).length);
    }
  };

  useEffect(() => {
    fetchAlerts();

    const channel = supabase
      .channel('alerts-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'alert_history'
      }, () => {
        fetchAlerts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleOpenChange = async (open: boolean) => {
    setIsOpen(open);
    
    if (open && unreadCount > 0) {
      // Mark all unread as acknowledged
      const unreadIds = alerts.filter(a => !a.acknowledged_at).map(a => a.id);
      if (unreadIds.length > 0) {
        await supabase
          .from('alert_history')
          .update({ acknowledged_at: new Date().toISOString() })
          .in('id', unreadIds);
        
        fetchAlerts();
      }
    }
  };

  const getSeverityIcon = (severity: string | null) => {
    switch (severity) {
      case 'error':
      case 'critical':
        return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-warning" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-success" />;
      default:
        return <Info className="w-4 h-4 text-primary" />;
    }
  };

  const clearAllAlerts = async () => {
    await supabase
      .from('alert_history')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    setAlerts([]);
    setUnreadCount(0);
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-xs bg-accent text-accent-foreground"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {alerts.length > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 text-xs text-muted-foreground"
              onClick={clearAllAlerts}
            >
              Clear all
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[300px]">
          {alerts.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No notifications yet
            </div>
          ) : (
            <div className="divide-y">
              {alerts.map(alert => (
                <div 
                  key={alert.id} 
                  className={`p-3 hover:bg-muted/50 transition-colors ${
                    !alert.acknowledged_at ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {getSeverityIcon(alert.severity)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium capitalize">
                        {alert.alert_type.replace(/_/g, ' ')}
                      </p>
                      {alert.message && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {alert.message}
                        </p>
                      )}
                      {alert.sent_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(alert.sent_at), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
