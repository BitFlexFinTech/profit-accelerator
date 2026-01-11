import { useState, useEffect, useRef, useCallback } from 'react';
import { StatusDot } from '@/components/ui/StatusDot';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Play, 
  Pause, 
  Download, 
  Search, 
  RefreshCw,
  Filter,
  Trash2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}

interface LogViewerProps {
  provider: string;
  ip?: string | null;
}

const LEVEL_STYLES = {
  info: 'text-primary',
  warn: 'text-warning',
  error: 'text-destructive',
  debug: 'text-muted-foreground',
};

const LEVEL_BADGES = {
  info: 'bg-primary/10 text-primary',
  warn: 'bg-warning/10 text-warning',
  error: 'bg-destructive/10 text-destructive',
  debug: 'bg-muted text-muted-foreground',
};

export function LogViewer({ provider, ip }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const fetchLogs = useCallback(async () => {
    if (!ip) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('provision-vps', {
        body: {
          action: 'get-logs',
          provider,
          ip,
          lines: 100,
        }
      });

      if (error) throw error;

      if (data?.logs) {
        const parsedLogs: LogEntry[] = data.logs.map((line: string, index: number) => {
          // Parse log line format: [2024-01-01 12:00:00] [INFO] message
          const timestampMatch = line.match(/\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\]]*)\]/);
          const levelMatch = line.match(/\[(INFO|WARN|ERROR|DEBUG)\]/i);
          
          return {
            id: `${Date.now()}-${index}`,
            timestamp: timestampMatch?.[1] || new Date().toISOString(),
            level: (levelMatch?.[1]?.toLowerCase() || 'info') as LogEntry['level'],
            message: line
              .replace(/\[\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\]]*\]/, '')
              .replace(/\[(INFO|WARN|ERROR|DEBUG)\]/i, '')
              .trim(),
          };
        });
        setLogs(parsedLogs);
      }
    } catch (err) {
      console.error('[LogViewer] Error fetching logs:', err);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [provider, ip]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [isStreaming, fetchLogs]);

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = !searchQuery || 
      log.message.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel = !levelFilter || log.level === levelFilter;
    return matchesSearch && matchesLevel;
  });

  const handleDownload = () => {
    const content = filteredLogs
      .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`)
      .join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${provider}-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return timestamp;
    }
  };

  return (
    <Card className="flex flex-col h-[500px] bg-secondary/30">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 p-3 border-b border-border/50">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex gap-1">
            {(['info', 'warn', 'error', 'debug'] as const).map(level => (
              <Button
                key={level}
                variant={levelFilter === level ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-2 text-xs capitalize"
                onClick={() => setLevelFilter(levelFilter === level ? null : level)}
              >
                {level}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setIsStreaming(!isStreaming)}
          >
            {isStreaming ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={fetchLogs}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setLogs([])}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Streaming Indicator */}
      {isStreaming && (
        <div className="px-3 py-1 bg-success/10 border-b border-success/20 flex items-center gap-2">
          <StatusDot color="success" pulse />
          <span className="text-xs text-success">Live streaming</span>
        </div>
      )}

      {/* Logs Content */}
      <ScrollArea className="flex-1 p-2" ref={scrollRef}>
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            {isLoading ? 'Loading logs...' : 'No logs to display'}
          </div>
        ) : (
          <div className="space-y-0.5 font-mono text-xs">
            {filteredLogs.map(log => (
              <div
                key={log.id}
                className={cn(
                  "flex items-start gap-2 px-2 py-1 rounded hover:bg-muted/50",
                  log.level === 'error' && 'bg-destructive/5'
                )}
              >
                <span className="text-muted-foreground flex-shrink-0 w-16">
                  {formatTimestamp(log.timestamp)}
                </span>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-[10px] px-1.5 py-0 flex-shrink-0 uppercase",
                    LEVEL_BADGES[log.level]
                  )}
                >
                  {log.level}
                </Badge>
                <span className={cn("flex-1 break-all", LEVEL_STYLES[log.level])}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer Stats */}
      <div className="px-3 py-2 border-t border-border/50 text-xs text-muted-foreground flex justify-between">
        <span>{filteredLogs.length} entries</span>
        <span>
          {logs.filter(l => l.level === 'error').length} errors / 
          {logs.filter(l => l.level === 'warn').length} warnings
        </span>
      </div>
    </Card>
  );
}
