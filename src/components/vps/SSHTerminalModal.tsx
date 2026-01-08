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

        // Connect to SSH command edge function for real command execution
        term.writeln('\x1b[32m✓ Connected to ' + instance.ipAddress + '\x1b[0m');
        term.writeln('');
        term.writeln('\x1b[90mType commands below. Commands are executed via SSH.\x1b[0m');
        term.writeln('');
        term.write('\x1b[36mroot@' + (instance.nickname || instance.provider) + '\x1b[0m:\x1b[34m~\x1b[0m$ ');

        setIsConnected(true);
        setIsConnecting(false);

        let currentLine = '';
        let isExecuting = false;

        const executeCommand = async (cmd: string) => {
          if (isExecuting) return;
          isExecuting = true;
          
          try {
            // Call ssh-command edge function
            const { data: result, error: cmdError } = await supabase.functions.invoke('ssh-command', {
              body: {
                ipAddress: instance.ipAddress,
                command: cmd,
                username: 'root',
                timeout: 30000,
              },
            });

            if (cmdError) {
              term.writeln('\x1b[31mError: ' + cmdError.message + '\x1b[0m');
            } else if (result?.output) {
              // Display the command output
              const lines = result.output.split('\n');
              lines.forEach((line: string) => term.writeln(line));
            } else if (result?.error) {
              term.writeln('\x1b[31m' + result.error + '\x1b[0m');
            }
          } catch (err) {
            term.writeln('\x1b[31mFailed to execute command\x1b[0m');
          }
          
          isExecuting = false;
        };

        term.onData(async (data) => {
          if (isExecuting) return;
          
          if (data === '\r') {
            // Enter key
            term.writeln('');
            
            if (currentLine.trim() === 'exit') {
              term.writeln('\x1b[33mConnection closed.\x1b[0m');
              onClose();
              return;
            }

            if (currentLine.trim() === 'clear') {
              term.clear();
              currentLine = '';
              term.write('\x1b[36mroot@' + (instance.nickname || instance.provider) + '\x1b[0m:\x1b[34m~\x1b[0m$ ');
              return;
            }

            if (currentLine.trim()) {
              await executeCommand(currentLine.trim());
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

        // Removed simulated command handler - now using real SSH execution

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
