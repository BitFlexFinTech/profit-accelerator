import { useState, useEffect } from 'react';
import { Globe, Copy, Check, Loader2, ShieldCheck, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface WhitelistStatus {
  isWhitelisted: boolean;
  range: string | null;
}

interface VPSStatus {
  hasRealVps: boolean;
  outboundIp: string | null;
  status: string | null;
}

export function IPWhitelistCard() {
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [vpsStatus, setVpsStatus] = useState<VPSStatus>({
    hasRealVps: false,
    outboundIp: null,
    status: null
  });
  const [whitelistStatus, setWhitelistStatus] = useState<WhitelistStatus>({
    isWhitelisted: false,
    range: null
  });

  useEffect(() => {
    checkRealVPSStatus();
  }, []);

  const checkRealVPSStatus = async () => {
    setIsLoading(true);
    try {
      // Check for REAL deployed VPS - must have status 'running' and a real outbound_ip
      const { data: vpsConfig } = await supabase
        .from('vps_config')
        .select('outbound_ip, status, provider')
        .eq('status', 'running')
        .not('outbound_ip', 'is', null)
        .limit(1);

      if (vpsConfig && vpsConfig.length > 0 && vpsConfig[0].outbound_ip) {
        setVpsStatus({
          hasRealVps: true,
          outboundIp: vpsConfig[0].outbound_ip,
          status: vpsConfig[0].status
        });

        // Only check whitelist status if we have a real VPS
        await fetchWhitelistStatus();
      } else {
        // No real VPS deployed
        setVpsStatus({
          hasRealVps: false,
          outboundIp: null,
          status: null
        });
      }
    } catch (error) {
      console.error('[IPWhitelistCard] Error checking VPS status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWhitelistStatus = async () => {
    // Only fetch if we have confirmed connected exchanges with IP restrictions
    const { data: connections } = await supabase
      .from('exchange_connections')
      .select('exchange_name')
      .eq('is_connected', true);

    if (!connections?.length) {
      setWhitelistStatus({ isWhitelisted: false, range: null });
      return;
    }

    const { data } = await supabase
      .from('credential_permissions')
      .select('ip_restricted, whitelisted_range, provider')
      .eq('ip_restricted', true)
      .limit(1);

    if (data && data.length > 0) {
      // Verify the whitelisted range matches our VPS IP
      const matchesVps = vpsStatus.outboundIp && 
        data[0].whitelisted_range?.includes(vpsStatus.outboundIp);
      
      setWhitelistStatus({
        isWhitelisted: matchesVps || false,
        range: matchesVps ? data[0].whitelisted_range || null : null
      });
    } else {
      setWhitelistStatus({ isWhitelisted: false, range: null });
    }
  };

  const copyToClipboard = async () => {
    if (!vpsStatus.outboundIp) return;
    
    try {
      await navigator.clipboard.writeText(vpsStatus.outboundIp);
      setCopied(true);
      toast.success('IP copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy');
    }
  };

  const handleVerifyConnection = async () => {
    if (!vpsStatus.outboundIp) {
      toast.error('No VPS IP available');
      return;
    }

    setIsVerifying(true);
    try {
      // Test VPS health with real IP
      const healthResponse = await supabase.functions.invoke('check-vps-health', {
        body: { ip: vpsStatus.outboundIp }
      });
      
      // Test exchange connections
      const exchangeResponse = await supabase.functions.invoke('trade-engine', {
        body: { action: 'test-connection', exchangeName: 'Binance' }
      });

      if (healthResponse.data?.healthy) {
        toast.success('VPS verified! Connection is working.');
      } else if (exchangeResponse.data?.success) {
        toast.success('Exchange connection verified!');
      } else {
        toast.warning('VPS not responding - check deployment');
      }
    } catch (error) {
      toast.error('Verification failed - check VPS status');
    } finally {
      setIsVerifying(false);
    }
  };

  // No VPS deployed - show clear message
  if (!isLoading && !vpsStatus.hasRealVps) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-semibold">Server Whitelist IP</h3>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-6 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No VPS Connected</p>
          <p className="text-xs text-muted-foreground mt-1">
            Deploy a VPS from the Settings tab to get a dedicated IP for exchange whitelisting.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Server Whitelist IP</h3>
        </div>
        {whitelistStatus.isWhitelisted && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/20 text-success text-xs font-medium">
            <ShieldCheck className="w-3 h-3" />
            Completed
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 p-3 rounded-lg bg-secondary/50 font-mono text-sm">
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-muted-foreground">Checking VPS...</span>
              </div>
            ) : vpsStatus.outboundIp ? (
              vpsStatus.outboundIp
            ) : (
              <span className="text-muted-foreground">Not available</span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={copyToClipboard}
            disabled={!vpsStatus.outboundIp || isLoading}
            className="shrink-0"
          >
            {copied ? (
              <Check className="w-4 h-4 text-success" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </div>

        {whitelistStatus.isWhitelisted && whitelistStatus.range && (
          <div className="p-3 rounded-lg bg-success/10 border border-success/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-success">Whitelisted Range</p>
                <p className="font-mono text-sm mt-1">{whitelistStatus.range}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleVerifyConnection}
                disabled={isVerifying}
                className="text-success hover:text-success hover:bg-success/10"
              >
                {isVerifying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span className="ml-1.5">Verify</span>
              </Button>
            </div>
          </div>
        )}

        {vpsStatus.hasRealVps && !whitelistStatus.isWhitelisted && (
          <p className="text-xs text-muted-foreground">
            Add this IP to your exchange API whitelist for enhanced security.
          </p>
        )}
      </div>
    </div>
  );
}
