import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Terminal as TerminalIcon, 
  Trash2, 
  Plug, 
  PlugZap,
  Server,
  Command,
  Loader2,
  Rocket
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface VPSTerminalPanelProps {
  serverIp?: string;
  serverName?: string;
}

export function VPSTerminalPanel({ 
  serverIp = '167.179.83.239', 
  serverName = 'Vultr Tokyo' 
}: VPSTerminalPanelProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTerminalReady, setIsTerminalReady] = useState(false);

  useEffect(() => {
    if (!terminalRef.current || terminalInstanceRef.current) return;

    let mounted = true;

    const initTerminal = async () => {
      try {
        const [xtermModule, fitModule, webLinksModule] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
          import('@xterm/addon-web-links'),
        ]);

        if (!mounted || !terminalRef.current) return;

        if (!document.getElementById('xterm-styles')) {
          const style = document.createElement('style');
          style.id = 'xterm-styles';
          style.textContent = `
            .xterm { height: 100%; }
            .xterm-viewport { overflow-y: auto !important; }
            .xterm-screen { height: 100%; }
          `;
          document.head.appendChild(style);
        }

        const Terminal = xtermModule.Terminal;
        const FitAddon = fitModule.FitAddon;
        const WebLinksAddon = webLinksModule.WebLinksAddon;

        const term = new Terminal({
          theme: {
            background: '#0a0a0a',
            foreground: '#22c55e',
            cursor: '#22c55e',
            cursorAccent: '#000000',
            selectionBackground: '#22c55e33',
            black: '#0a0a0a',
            red: '#ef4444',
            green: '#22c55e',
            yellow: '#eab308',
            blue: '#3b82f6',
            magenta: '#a855f7',
            cyan: '#06b6d4',
            white: '#f5f5f5',
          },
          fontFamily: 'JetBrains Mono, Fira Code, Monaco, Consolas, monospace',
          fontSize: 13,
          cursorBlink: true,
          cursorStyle: 'block',
          scrollback: 10000,
          convertEol: true,
        });

        const fit = new FitAddon();
        const webLinks = new WebLinksAddon();

        term.loadAddon(fit);
        term.loadAddon(webLinks);
        term.open(terminalRef.current);
        
        setTimeout(() => fit.fit(), 50);

        term.writeln('\x1b[32m╔════════════════════════════════════════════════════╗\x1b[0m');
        term.writeln('\x1b[32m║          HFT Bot VPS Terminal (Live SSH)           ║\x1b[0m');
        term.writeln('\x1b[32m╚════════════════════════════════════════════════════╝\x1b[0m');
        term.writeln('');
        term.writeln(`\x1b[33mServer:\x1b[0m ${serverIp} (${serverName})`);
        term.writeln('\x1b[90mPress "Connect" to establish SSH connection.\x1b[0m');
        term.writeln('');

        terminalInstanceRef.current = term;
        fitAddonRef.current = fit;
        setIsTerminalReady(true);
      } catch (error) {
        console.error('Failed to initialize terminal:', error);
      }
    };

    initTerminal();

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      mounted = false;
      window.removeEventListener('resize', handleResize);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.dispose();
        terminalInstanceRef.current = null;
      }
    };
  }, [serverIp, serverName]);

  const connect = useCallback(() => {
    const term = terminalInstanceRef.current;
    if (!term) return;

    setIsConnecting(true);
    term.writeln('\x1b[33mEstablishing SSH connection via WebSocket...\x1b[0m');

    // Get the Supabase project URL and create WebSocket URL
    const supabaseUrl = 'https://iibdlazwkossyelyroap.supabase.co';
    const wsUrl = supabaseUrl.replace('https://', 'wss://') + '/functions/v1/ssh-terminal';

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected to SSH terminal');
        term.writeln('\x1b[32mWebSocket connected, authenticating...\x1b[0m');
        
        // Send connect command to initiate SSH
        ws.send(JSON.stringify({ type: 'connect' }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'output') {
            term.write(message.data);
          } else if (message.type === 'ssh_connected') {
            setIsConnected(true);
            setIsConnecting(false);
            toast.success(`Connected to ${serverIp}`);
          } else if (message.type === 'error') {
            term.writeln(`\x1b[31mError: ${message.message}\x1b[0m`);
            setIsConnecting(false);
            toast.error(message.message);
          } else if (message.type === 'disconnected') {
            term.writeln(`\x1b[33m\n${message.message}\x1b[0m`);
            setIsConnected(false);
            toast.info('SSH session ended');
          } else if (message.type === 'connected') {
            term.writeln(`\x1b[32m${message.message}\x1b[0m`);
          }
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        term.writeln('\x1b[31mWebSocket connection error\x1b[0m');
        setIsConnecting(false);
        toast.error('Connection failed');
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;
      };

      // Forward terminal input to WebSocket
      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      });

    } catch (error) {
      console.error('Failed to connect:', error);
      term.writeln('\x1b[31mFailed to establish connection\x1b[0m');
      setIsConnecting(false);
      toast.error('Connection failed');
    }
  }, [serverIp]);

  const disconnect = useCallback(() => {
    const term = terminalInstanceRef.current;
    const ws = wsRef.current;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'disconnect' }));
      ws.close();
    }
    
    if (term) {
      term.writeln('\x1b[33m\nDisconnected.\x1b[0m');
    }
    
    setIsConnected(false);
    wsRef.current = null;
    toast.info('Disconnected from VPS');
  }, []);

  const clearTerminal = useCallback(() => {
    terminalInstanceRef.current?.clear();
  }, []);

  const sendCommand = useCallback((cmd: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !isConnected) {
      toast.error('Not connected to server');
      return;
    }
    
    // Send command followed by enter
    ws.send(JSON.stringify({ type: 'input', data: cmd + '\r' }));
  }, [isConnected]);

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
            <TerminalIcon className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <h3 className="font-semibold">VPS Terminal (Live SSH)</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Server className="w-3 h-3" />
              <span>{serverIp} ({serverName})</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
            isConnected ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground'
          }`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
            {isConnected ? 'SSH Connected' : 'Disconnected'}
          </div>

          {!isConnected ? (
            <Button size="sm" onClick={connect} disabled={isConnecting || !isTerminalReady}>
              {isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plug className="w-4 h-4" />
              )}
              <span className="ml-1">Connect SSH</span>
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={disconnect}>
              <PlugZap className="w-4 h-4" />
              <span className="ml-1">Disconnect</span>
            </Button>
          )}

          <Button size="icon" variant="ghost" onClick={clearTerminal}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div 
        ref={terminalRef} 
        className="rounded-lg overflow-hidden border border-border bg-[#0a0a0a]"
        style={{ height: '280px' }}
      />

      {isConnected && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Command className="w-3 h-3" /> Quick:
          </span>
          <Button 
            size="sm" 
            className="text-xs h-7 bg-success/20 text-success hover:bg-success/30 border-success/30"
            onClick={() => sendCommand('curl -sSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | sudo bash')}
          >
            <Rocket className="w-3 h-3 mr-1" />
            Install HFT Bot
          </Button>
          {[
            { label: 'docker ps', cmd: 'docker ps' },
            { label: 'logs', cmd: 'docker logs hft-bot --tail 10' },
            { label: 'uptime', cmd: 'uptime' },
            { label: 'htop', cmd: 'htop' },
            { label: 'status', cmd: 'systemctl status hft-bot' },
            { label: 'health', cmd: 'curl -s localhost:8080/health | jq' },
          ].map(({ label, cmd }) => (
            <Button
              key={cmd} 
              size="sm" 
              variant="outline" 
              className="text-xs h-7"
              onClick={() => sendCommand(cmd)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
