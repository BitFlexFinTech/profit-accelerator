import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  Bell, AlertTriangle, Info, CheckCircle, Trophy, Server, 
  Brain, TrendingUp, X, Check, Trash2, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface SystemNotification {
  id: string;
  created_at: string;
  type: string;
  title: string;
  message: string | null;
  severity: string;
  category: string | null;
  metadata: Record<string, unknown>;
  read: boolean;
  dismissed: boolean;
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'vps' | 'trading' | 'ai' | 'unlock'>('all');

  const fetchNotifications = async () => {
    let query = supabase
      .from('system_notifications')
      .select('*')
      .eq('dismissed', false)
      .order('created_at', { ascending: false })
      .limit(100);

    if (filter !== 'all') {
      query = query.eq('category', filter);
    }

    const { data, error } = await query;
    if (!error && data) {
      setNotifications(data as SystemNotification[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNotifications();

    const channel = supabase
      .channel('notifications-center')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'system_notifications'
      }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filter]);

  const markAsRead = async (id: string) => {
    await supabase
      .from('system_notifications')
      .update({ read: true })
      .eq('id', id);
    fetchNotifications();
  };

  const dismiss = async (id: string) => {
    await supabase
      .from('system_notifications')
      .update({ dismissed: true })
      .eq('id', id);
    fetchNotifications();
  };

  const dismissAll = async () => {
    await supabase
      .from('system_notifications')
      .update({ dismissed: true })
      .eq('dismissed', false);
    setNotifications([]);
    toast.success('All notifications dismissed');
  };

  const markAllRead = async () => {
    await supabase
      .from('system_notifications')
      .update({ read: true })
      .eq('read', false);
    fetchNotifications();
    toast.success('All marked as read');
  };

  const getIcon = (type: string, severity: string) => {
    if (type === 'mode_unlock') return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (type === 'vps_health') return <Server className="w-5 h-5 text-orange-400" />;
    if (type === 'rate_limit') return <AlertTriangle className="w-5 h-5 text-warning" />;
    if (type === 'trade_alert') return <TrendingUp className="w-5 h-5 text-success" />;
    if (type === 'ai_decision') return <Brain className="w-5 h-5 text-purple-400" />;
    
    switch (severity) {
      case 'error': return <AlertTriangle className="w-5 h-5 text-destructive" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-warning" />;
      case 'success': case 'achievement': return <CheckCircle className="w-5 h-5 text-success" />;
      default: return <Info className="w-5 h-5 text-primary" />;
    }
  };

  const getSeverityClass = (severity: string) => {
    switch (severity) {
      case 'error': return 'border-destructive/30 bg-destructive/5';
      case 'warning': return 'border-warning/30 bg-warning/5';
      case 'success': case 'achievement': return 'border-success/30 bg-success/5';
      default: return 'border-primary/30 bg-primary/5';
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <Card className="glass-card h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Notification Center
            {unreadCount > 0 && (
              <Badge className="bg-accent text-accent-foreground">
                {unreadCount} new
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs">
              <Check className="w-3 h-3 mr-1" />
              Mark all read
            </Button>
            <Button variant="ghost" size="sm" onClick={dismissAll} className="text-xs text-muted-foreground">
              <Trash2 className="w-3 h-3 mr-1" />
              Clear all
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="px-4">
          <TabsList className="grid grid-cols-5 w-full h-8">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger value="vps" className="text-xs">VPS</TabsTrigger>
            <TabsTrigger value="trading" className="text-xs">Trading</TabsTrigger>
            <TabsTrigger value="ai" className="text-xs">AI</TabsTrigger>
            <TabsTrigger value="unlock" className="text-xs">Unlocks</TabsTrigger>
          </TabsList>
        </Tabs>

        <ScrollArea className="h-[500px] mt-2">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">No notifications</p>
              <p className="text-xs mt-1">System alerts will appear here</p>
            </div>
          ) : (
            <div className="space-y-2 px-4 pb-4">
              <AnimatePresence>
                {notifications.map((notification, index) => (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 100 }}
                    transition={{ delay: index * 0.05 }}
                    className={`p-3 rounded-lg border ${getSeverityClass(notification.severity)} ${
                      !notification.read ? 'ring-1 ring-primary/30' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {getIcon(notification.type, notification.severity)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-sm">{notification.title}</h4>
                          {notification.severity === 'achievement' && (
                            <Sparkles className="w-4 h-4 text-yellow-500" />
                          )}
                          {!notification.read && (
                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                          )}
                        </div>
                        {notification.message && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {notification.message}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => markAsRead(notification.id)}
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          onClick={() => dismiss(notification.id)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
