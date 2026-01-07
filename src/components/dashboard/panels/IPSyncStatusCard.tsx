import { useState, useEffect } from 'react';
import { Shield, Copy, Check, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExchangeWhitelistStatus {
  exchange: string;
  ip_restricted: boolean;
  whitelisted_range: string | null;
}

export function IPSyncStatusCard() {
  const [vpsIp, setVpsIp] = useState<string | null>(null);
  const [exchanges, setExchanges] = useState<ExchangeWhitelistStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Get VPS IP
      const { data: vpsConfig } = await supabase
        .from('vps_config')
        .select('outbound_ip')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      setVpsIp(vpsConfig?.outbound_ip || null);

      // Get connected exchanges and their whitelist status
      const { data: connections } = await supabase
        .from('exchange_connections')
        .select('exchange_name')
        .eq('is_connected', true);

      const { data: permissions } = await supabase
        .from('credential_permissions')
        .select('provider, ip_restricted, whitelisted_range');

      const exchangeStatus = (connections || []).map(conn => {
        const perm = permissions?.find(p => p.provider === conn.exchange_name);
        return {
          exchange: conn.exchange_name,
          ip_restricted: perm?.ip_restricted || false,
          whitelisted_range: perm?.whitelisted_range || null,
        };
      });

      setExchanges(exchangeStatus);
    } catch (err) {
      console.error('Failed to fetch IP sync status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyIp = () => {
    if (vpsIp) {
      navigator.clipboard.writeText(vpsIp);
      setCopied(true);
      toast.success('IP copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSyncNow = async () => {
    if (!vpsIp) {
      toast.error('No VPS IP configured');
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('sync-ip-whitelist', {
        body: { vps_ip: vpsIp }
      });

      if (error) throw error;
      
      toast.success(`IP synced to ${data.exchanges_synced} exchange(s)`);
      await fetchData();
    } catch (err) {
      toast.error('Failed to sync IP whitelist');
    }
  };

  const whitelistUrls: Record<string, string> = {
    binance: 'https://www.binance.com/en/my/settings/api-management',
    bybit: 'https://www.bybit.com/user/api-management',
    okx: 'https://www.okx.com/account/my-api',
    hyperliquid: 'https://app.hyperliquid.xyz/account',
  };

  if (!vpsIp) {
    return null;
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h4 className="font-semibold">IP Whitelist Sync</h4>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSyncNow}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* VPS IP */}
      <div className="p-3 rounded-lg bg-secondary/30 mb-4">
        <p className="text-xs text-muted-foreground mb-1">VPS IP Address</p>
        <div className="flex items-center justify-between">
          <code className="font-mono text-sm">{vpsIp}</code>
          <Button variant="ghost" size="sm" onClick={handleCopyIp}>
            {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Exchange Status */}
      <div className="space-y-2">
        {exchanges.length === 0 ? (
          <p className="text-sm text-muted-foreground">No connected exchanges</p>
        ) : (
          exchanges.map(ex => (
            <div 
              key={ex.exchange}
              className="flex items-center justify-between p-2 rounded bg-secondary/20"
            >
              <div className="flex items-center gap-2">
                {ex.whitelisted_range === vpsIp ? (
                  <Check className="w-4 h-4 text-success" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-warning" />
                )}
                <span className="text-sm capitalize">{ex.exchange}</span>
              </div>
              {whitelistUrls[ex.exchange.toLowerCase()] && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => window.open(whitelistUrls[ex.exchange.toLowerCase()], '_blank')}
                >
                  <ExternalLink className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      {exchanges.some(e => e.whitelisted_range !== vpsIp) && (
        <p className="text-xs text-warning mt-3">
          ⚠️ Whitelist the VPS IP in your exchange API settings
        </p>
      )}
    </div>
  );
}
