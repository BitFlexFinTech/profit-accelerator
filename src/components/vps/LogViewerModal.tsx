import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  RefreshCw,
  Download,
  Search,
  ArrowDown,
  Pause,
  Play,
} from 'lucide-react';
import { VPSInstance } from '@/types/cloudCredentials';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface LogViewerModalProps {
  instance: VPSInstance;
  onClose: () => void;
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export function LogViewerModal({ instance, onClose }: LogViewerModalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchLogs = async () => {
    if (isPaused) return;

    try {
      // Try to fetch real logs via ssh-command
      const { data, error } = await supabase.functions.invoke('ssh-command', {
        body: {
          instanceId: instance.id,
          command: 'pm2 logs trading-bot --lines 100 --nostream 2>/dev/null || tail -100 /var/log/syslog 2>/dev/null || echo "No logs available"',
        },
      });

      if (error) {
        console.error('Error fetching logs:', error);
        setIsLoading(false);
        return;
      }

      if (data?.output) {
        const lines = data.output.split('\n').filter((line: string) => line.trim());
        const parsedLogs: LogEntry[] = lines.map((line: string) => {
          // Try to parse PM2 log format: timestamp | type | message
          const pm2Match = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.Z]+)?\s*\|?\s*([\w-]+)?\s*\|?\s*(.*)$/);
          if (pm2Match && pm2Match[3]) {
            const level = line.toLowerCase().includes('error') ? 'error' 
              : line.toLowerCase().includes('warn') ? 'warn'
              : line.toLowerCase().includes('debug') ? 'debug'
              : 'info';
            return {
              timestamp: pm2Match[1] || new Date().toISOString(),
              level: level as LogEntry['level'],
              message: pm2Match[3] || line,
            };
          }
          // Fallback: detect level from content
          const level = line.toLowerCase().includes('error') ? 'error' 
            : line.toLowerCase().includes('warn') ? 'warn'
            : line.toLowerCase().includes('debug') ? 'debug'
            : 'info';
          return {
            timestamp: new Date().toISOString(),
            level: level as LogEntry['level'],
            message: line,
          };
        });
        setLogs(parsedLogs);
      } else if (data?.error) {
        setLogs([{
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `Failed to fetch logs: ${data.error}`,
        }]);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      setLogs([{
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Connection error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    intervalRef.current = setInterval(fetchLogs, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [instance.ipAddress, isPaused]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleDownload = () => {
    const content = logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${instance.nickname || instance.provider}-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = filter
    ? logs.filter((l) => l.message.toLowerCase().includes(filter.toLowerCase()))
    : logs;

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'text-destructive';
      case 'warn':
        return 'text-warning';
      case 'debug':
        return 'text-muted-foreground';
      default:
        return 'text-foreground';
    }
  };

  const getLevelBadge = (level: LogEntry['level']) => {
    const colors: Record<string, string> = {
      error: 'bg-destructive/10 text-destructive',
      warn: 'bg-warning/10 text-warning',
      info: 'bg-primary/10 text-primary',
      debug: 'bg-muted text-muted-foreground',
    };
    return colors[level] || colors.info;
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Logs: {instance.nickname || `${instance.provider}-${instance.region}`}</span>
            <Badge variant="outline" className="font-mono text-xs">
              {instance.ipAddress}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 py-2 border-b border-border/50">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-8 h-8"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
          >
            {isPaused ? (
              <>
                <Play className="h-4 w-4 mr-1" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-4 w-4 mr-1" />
                Pause
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoScroll(!autoScroll)}
            className={autoScroll ? 'bg-primary/10' : ''}
          >
            <ArrowDown className="h-4 w-4 mr-1" />
            Auto-scroll
          </Button>
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-1", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
        </div>

        {/* Log Content */}
        <ScrollArea className="flex-1 bg-muted/30 rounded-md p-2" ref={scrollRef}>
          {isLoading && logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Loading logs...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {filter ? 'No logs match your filter' : 'No logs available'}
            </div>
          ) : (
            <div className="font-mono text-xs space-y-0.5">
              {filteredLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex items-start gap-2 py-0.5 px-1 rounded hover:bg-muted/50",
                    getLevelColor(log.level)
                  )}
                >
                  <span className="text-muted-foreground whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] px-1 py-0 uppercase", getLevelBadge(log.level))}
                  >
                    {log.level}
                  </Badge>
                  <span className="flex-1 break-all">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
          <span>{filteredLogs.length} log entries</span>
          <span>{isPaused ? 'Paused' : 'Live updates every 3s'}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
