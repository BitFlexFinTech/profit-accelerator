import { useState, useEffect } from 'react';
import { Globe, Copy, Check, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useHFTSettings } from '@/hooks/useHFTSettings';

export function IPWhitelistCard() {
  const { settings, fetchOutboundIp } = useHFTSettings();
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const ip = settings.latency.outboundIp;

  useEffect(() => {
    if (!ip) {
      loadIP();
    }
  }, []);

  const loadIP = async () => {
    setIsLoading(true);
    await fetchOutboundIp();
    setIsLoading(false);
  };

  const copyToClipboard = async () => {
    if (!ip) return;
    
    try {
      await navigator.clipboard.writeText(ip);
      setCopied(true);
      toast.success('IP copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <Globe className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">Server Whitelist IP</h3>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 p-3 rounded-lg bg-secondary/50 font-mono text-sm">
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-muted-foreground">Fetching IP...</span>
              </div>
            ) : ip ? (
              ip
            ) : (
              <span className="text-muted-foreground">Not available</span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={copyToClipboard}
            disabled={!ip || isLoading}
            className="shrink-0"
          >
            {copied ? (
              <Check className="w-4 h-4 text-success" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Add this IP to your exchange API whitelist for enhanced security.
        </p>

        <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">Security Warning</p>
              <p className="text-xs text-muted-foreground mt-1">
                Disable withdrawals on all exchange API keys as the primary defense. 
                IP whitelisting is a secondary security measure.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
