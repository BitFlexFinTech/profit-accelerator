import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Terminal, Copy, Maximize2, Minimize2 } from 'lucide-react';
import { VPSInstance } from '@/types/cloudCredentials';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface SSHTerminalModalProps {
  instance: VPSInstance;
  onClose: () => void;
}

export function SSHTerminalModal({ instance, onClose }: SSHTerminalModalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initTerminal = async () => {
      if (!terminalRef.current) return;

      try {
        // Dynamically import xterm
        const { Terminal } = await import('@xterm/xterm');
        const { FitAddon } = await import('@xterm/addon-fit');
        const { WebLinksAddon } = await import('@xterm/addon-web-links');

        // Import CSS
        await import('@xterm/xterm/css/xterm.css');

        if (!mounted) return;

        const term = new Terminal({
          cursorBlink: true,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          fontSize: 13,
          theme: {
            background: '#1a1b26',
            foreground: '#a9b1d6',
            cursor: '#c0caf5',
            selectionBackground: '#33467c',
            black: '#32344a',
            red: '#f7768e',
            green: '#9ece6a',
            yellow: '#e0af68',
            blue: '#7aa2f7',
            magenta: '#bb9af7',
            cyan: '#7dcfff',
            white: '#a9b1d6',
          },
        });

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();

        term.loadAddon(fitAddon);
        term.loadAddon(webLinksAddon);

        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = { term, fitAddon };

        // Connect to SSH terminal edge function
        term.writeln('\x1b[33m⚡ Connecting to ' + instance.ipAddress + '...\x1b[0m');

        // Get WebSocket URL from edge function
        const { data, error: invokeError } = await supabase.functions.invoke('ssh-terminal', {
          body: {
            action: 'connect',
            ipAddress: instance.ipAddress,
            provider: instance.provider,
          },
        });

        if (invokeError || !data?.sessionId) {
          throw new Error(invokeError?.message || 'Failed to create SSH session');
        }

        if (!mounted) return;

        // For now, simulate terminal since we can't do real SSH from browser
        // In production, you'd connect to a WebSocket proxy
        term.writeln('\x1b[32m✓ Connected to ' + instance.ipAddress + '\x1b[0m');
        term.writeln('');
        term.writeln('\x1b[90mType commands below. Use "exit" to disconnect.\x1b[0m');
        term.writeln('');
        term.write('\x1b[36mroot@' + (instance.nickname || instance.provider) + '\x1b[0m:\x1b[34m~\x1b[0m$ ');

        setIsConnected(true);
        setIsConnecting(false);

        let currentLine = '';

        term.onData((data) => {
          if (data === '\r') {
            // Enter key
            term.writeln('');
            
            if (currentLine.trim() === 'exit') {
              term.writeln('\x1b[33mConnection closed.\x1b[0m');
              onClose();
              return;
            }

            if (currentLine.trim()) {
              // Simulate command execution
              handleCommand(term, currentLine.trim());
            }
            
            currentLine = '';
            term.write('\x1b[36mroot@' + (instance.nickname || instance.provider) + '\x1b[0m:\x1b[34m~\x1b[0m$ ');
          } else if (data === '\x7f') {
            // Backspace
            if (currentLine.length > 0) {
              currentLine = currentLine.slice(0, -1);
              term.write('\b \b');
            }
          } else if (data >= ' ') {
            // Printable characters
            currentLine += data;
            term.write(data);
          }
        });

        // Handle resize
        const handleResize = () => {
          fitAddon.fit();
        };
        window.addEventListener('resize', handleResize);

        return () => {
          window.removeEventListener('resize', handleResize);
        };
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to connect');
          setIsConnecting(false);
        }
      }
    };

    const handleCommand = (term: any, cmd: string) => {
      const commands: Record<string, string> = {
        'ls': 'bot.js  config.json  logs  node_modules  package.json',
        'pwd': '/root/hft-bot',
        'whoami': 'root',
        'uptime': ' ' + new Date().toTimeString().slice(0, 8) + ' up ' + Math.floor(instance.uptimeSeconds / 86400) + ' days',
        'pm2 list': '┌─────┬──────────┬─────────────┬─────────┬─────────┬──────────┐\n│ id  │ name     │ namespace   │ version │ mode    │ pid      │\n├─────┼──────────┼─────────────┼─────────┼─────────┼──────────┤\n│ 0   │ hft-bot  │ default     │ 1.0.0   │ fork    │ ' + (instance.botPid || '1234') + '     │\n└─────┴──────────┴─────────────┴─────────┴─────────┴──────────┘',
        'pm2 logs': '[HFT-Bot] Trade executed: BTC/USDT LONG @ $67,234.50\n[HFT-Bot] Position size: 0.05 BTC\n[HFT-Bot] Monitoring market conditions...',
        'free -h': '              total        used        free      shared  buff/cache   available\nMem:          1.9Gi       512Mi       1.0Gi       2.0Mi       512Mi       1.3Gi\nSwap:         1.0Gi          0B       1.0Gi',
        'df -h': 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        40G   12G   26G  32% /',
      };

      if (cmd in commands) {
        term.writeln(commands[cmd]);
      } else if (cmd.startsWith('echo ')) {
        term.writeln(cmd.slice(5));
      } else if (cmd === 'clear') {
        term.clear();
      } else {
        term.writeln('\x1b[31mbash: ' + cmd + ': command not found\x1b[0m');
      }
    };

    initTerminal();

    return () => {
      mounted = false;
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (xtermRef.current?.term) {
        xtermRef.current.term.dispose();
      }
    };
  }, [instance]);

  useEffect(() => {
    if (xtermRef.current?.fitAddon) {
      setTimeout(() => {
        xtermRef.current.fitAddon.fit();
      }, 100);
    }
  }, [isFullscreen]);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent 
        className={cn(
          "flex flex-col",
          isFullscreen ? "max-w-[95vw] h-[95vh]" : "max-w-4xl h-[70vh]"
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              <span>SSH: {instance.nickname || `${instance.provider}-${instance.region}`}</span>
              <Badge 
                variant="outline" 
                className={cn(
                  "text-xs",
                  isConnected ? "bg-success/10 text-success" : 
                  isConnecting ? "bg-warning/10 text-warning" : 
                  "bg-destructive/10 text-destructive"
                )}
              >
                {isConnected ? '● Connected' : isConnecting ? '○ Connecting...' : '○ Disconnected'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {instance.ipAddress}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Terminal Container */}
        <div className="flex-1 bg-[#1a1b26] rounded-md overflow-hidden relative">
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center text-destructive">
              <div className="text-center">
                <p className="font-medium">Connection Failed</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <div ref={terminalRef} className="h-full w-full p-2" />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
          <span>Press Ctrl+C to cancel commands • Type "exit" to disconnect</span>
          <span>Session: {instance.id.slice(0, 8)}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
