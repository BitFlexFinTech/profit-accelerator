import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { Button } from '@/components/ui/button';
import { 
  Terminal as TerminalIcon, 
  Trash2, 
  Plug, 
  PlugZap,
  Server,
  Command,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface VPSTerminalPanelProps {
  serverIp?: string;
  serverName?: string;
}

export function VPSTerminalPanel({ 
  serverIp = '167.179.83.239', 
  serverName = 'Vultr Tokyo' 
}: VPSTerminalPanelProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const commandBufferRef = useRef('');

  const handleDemoCommand = useCallback((cmd: string, term: Terminal) => {
    const trimmed = cmd.trim();

    const responses: Record<string, string> = {
      'docker ps': 'CONTAINER ID   IMAGE                   STATUS         PORTS\na1b2c3d4e5f6   tokyo-hft/bot:latest    Up 3 hours     443/tcp\nb2c3d4e5f6g7   redis:alpine            Up 3 hours     6379/tcp',
      'uptime': ' 14:32:01 up 8 days, 4:21, 1 user, load average: 0.42, 0.38, 0.35',
      'free -h': '              total        used        free      shared  buff/cache   available\nMem:          1.0Gi       412Mi       128Mi       2.0Mi       459Mi       468Mi\nSwap:         512Mi        0Mi       512Mi',
      'df -h': 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        25G  4.2G   20G  18% /\ntmpfs           512M     0  512M   0% /dev/shm',
      'ls': 'docker-compose.yml  logs  config.json  start.sh  .env',
      'ls -la': 'total 32\ndrwxr-xr-x 4 root root 4096 Jan  6 14:00 .\ndrwxr-xr-x 3 root root 4096 Jan  1 00:00 ..\n-rw-r--r-- 1 root root  256 Jan  6 12:00 .env\n-rw-r--r-- 1 root root 1024 Jan  5 10:00 config.json\n-rw-r--r-- 1 root root  512 Jan  4 08:00 docker-compose.yml\ndrwxr-xr-x 2 root root 4096 Jan  6 14:00 logs\n-rwxr-xr-x 1 root root  128 Jan  3 06:00 start.sh',
      'docker logs hft-bot --tail 5': '[2024-01-06 14:30:01] Trade executed: BTC/USDT BUY 0.01 @ 42156.32\n[2024-01-06 14:31:15] Trade executed: ETH/USDT SELL 0.1 @ 2289.45\n[2024-01-06 14:32:00] Heartbeat OK - Latency: 18ms\n[2024-01-06 14:32:30] Market data updated\n[2024-01-06 14:33:00] Position check: 2 open positions',
      'htop': '  CPU[||||||||||||||||||||                    ] 42.3%\n  Mem[||||||||||||||                          ] 38.5%\n  Swp[                                        ]  0.0%\n\n  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\n 1234 root      20   0  512340  98432  12345 S  12.3   9.6   0:45.23 node\n 1235 root      20   0  128000  24000   8000 S   2.1   2.3   0:12.45 redis',
      'systemctl status hft-bot': '● hft-bot.service - HFT Trading Bot\n     Loaded: loaded (/etc/systemd/system/hft-bot.service; enabled)\n     Active: active (running) since Sat 2024-01-06 06:00:00 JST; 8h ago\n   Main PID: 1234 (node)\n      Tasks: 11 (limit: 1024)\n     Memory: 98.4M\n        CPU: 45.230s',
      'pwd': '/root/hft-bot',
      'whoami': 'root',
      'date': new Date().toString(),
      'cat config.json': '{\n  "exchange": "bybit",\n  "symbol": "BTCUSDT",\n  "leverage": 10,\n  "maxPosition": 0.1,\n  "stopLoss": 2.5,\n  "takeProfit": 5.0\n}',
      'clear': '\x1b[2J\x1b[H',
      'help': 'Available commands: docker ps, docker logs, uptime, free -h, df -h, ls, htop, systemctl status, pwd, whoami, date, clear',
    };

    if (trimmed === 'clear') {
      term.clear();
    } else if (responses[trimmed]) {
      term.writeln(responses[trimmed]);
    } else if (trimmed.startsWith('docker')) {
      term.writeln(`bash: ${trimmed}: container not found`);
    } else if (trimmed) {
      term.writeln(`bash: ${trimmed}: command not found`);
    }
  }, []);

  useEffect(() => {
    if (!terminalRef.current || terminalInstanceRef.current) return;

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
    
    setTimeout(() => fit.fit(), 0);

    term.writeln('\x1b[32m╔════════════════════════════════════════════════════╗\x1b[0m');
    term.writeln('\x1b[32m║          HFT Bot VPS Terminal                      ║\x1b[0m');
    term.writeln('\x1b[32m╚════════════════════════════════════════════════════╝\x1b[0m');
    term.writeln('');
    term.writeln(`\x1b[33mServer:\x1b[0m ${serverIp} (${serverName})`);
    term.writeln('\x1b[90mPress "Connect" to establish SSH connection.\x1b[0m');
    term.writeln('');

    terminalInstanceRef.current = term;
    fitAddonRef.current = fit;

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      terminalInstanceRef.current = null;
    };
  }, [serverIp, serverName]);

  const connect = useCallback(() => {
    const term = terminalInstanceRef.current;
    if (!term) return;

    setIsConnecting(true);
    term.writeln('\x1b[33mConnecting to server...\x1b[0m');

    setTimeout(() => {
      setIsConnected(true);
      setIsConnecting(false);
      term.writeln('\x1b[32mConnected! (demo mode)\x1b[0m');
      term.writeln('');
      term.write('\x1b[32mroot@hft-bot:~# \x1b[0m');
      toast.success('Connected to VPS');

      const dataHandler = term.onData((data) => {
        if (data === '\r') {
          term.writeln('');
          handleDemoCommand(commandBufferRef.current, term);
          commandBufferRef.current = '';
          term.write('\x1b[32mroot@hft-bot:~# \x1b[0m');
        } else if (data === '\x7f') {
          if (commandBufferRef.current.length > 0) {
            commandBufferRef.current = commandBufferRef.current.slice(0, -1);
            term.write('\b \b');
          }
        } else if (data >= ' ') {
          commandBufferRef.current += data;
          term.write(data);
        }
      });

      return () => dataHandler.dispose();
    }, 1500);
  }, [handleDemoCommand]);

  const disconnect = useCallback(() => {
    const term = terminalInstanceRef.current;
    if (term) {
      term.writeln('\x1b[33m\nDisconnected.\x1b[0m');
    }
    setIsConnected(false);
    commandBufferRef.current = '';
    toast.info('Disconnected from VPS');
  }, []);

  const clearTerminal = useCallback(() => {
    terminalInstanceRef.current?.clear();
  }, []);

  const sendQuickCommand = useCallback((cmd: string) => {
    const term = terminalInstanceRef.current;
    if (!term || !isConnected) return;
    
    term.writeln(cmd);
    handleDemoCommand(cmd, term);
    term.write('\x1b[32mroot@hft-bot:~# \x1b[0m');
  }, [isConnected, handleDemoCommand]);

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
            <TerminalIcon className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <h3 className="font-semibold">VPS Terminal</h3>
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
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>

          {!isConnected ? (
            <Button size="sm" onClick={connect} disabled={isConnecting}>
              {isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plug className="w-4 h-4" />
              )}
              <span className="ml-1">Connect</span>
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
          {[
            { label: 'docker ps', cmd: 'docker ps' },
            { label: 'logs', cmd: 'docker logs hft-bot --tail 5' },
            { label: 'uptime', cmd: 'uptime' },
            { label: 'htop', cmd: 'htop' },
            { label: 'status', cmd: 'systemctl status hft-bot' },
          ].map(({ label, cmd }) => (
            <Button 
              key={cmd} 
              size="sm" 
              variant="outline" 
              className="text-xs h-7"
              onClick={() => sendQuickCommand(cmd)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
