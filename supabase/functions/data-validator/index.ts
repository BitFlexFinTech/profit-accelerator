import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action } = await req.json().catch(() => ({ action: 'validate-all' }));

    console.log(`[DataValidator] Action: ${action}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const results = {
      action,
      timestamp: new Date().toISOString(),
      cleaned: {
        mock_vps_ips: 0,
        stale_metrics: 0,
        invalid_credentials: 0,
      },
      validated: {
        vps_configs: 0,
        exchange_connections: 0,
      },
      errors: [] as string[],
    };

    // 1. Remove mock/test VPS IPs
    const mockIpPatterns = ['192.168.%', '10.0.%', '10.%', '127.0.0.1', '0.0.0.0', 'localhost'];
    
    for (const pattern of mockIpPatterns) {
      const { data: mockVps, error } = await supabase
        .from('vps_config')
        .delete()
        .like('outbound_ip', pattern)
        .select('id');
      
      if (mockVps) {
        results.cleaned.mock_vps_ips += mockVps.length;
        console.log(`[DataValidator] Removed ${mockVps.length} VPS with mock IP pattern: ${pattern}`);
      }
      if (error) {
        results.errors.push(`VPS cleanup error: ${error.message}`);
      }
    }

    // Also remove exact matches
    const { data: exactMockVps } = await supabase
      .from('vps_config')
      .delete()
      .in('outbound_ip', ['127.0.0.1', '0.0.0.0', 'localhost', ''])
      .select('id');
    
    if (exactMockVps) {
      results.cleaned.mock_vps_ips += exactMockVps.length;
    }

    // 2. Remove stale VPS metrics (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: staleMetrics } = await supabase
      .from('vps_metrics')
      .delete()
      .lt('recorded_at', oneHourAgo)
      .select('id');
    
    if (staleMetrics) {
      results.cleaned.stale_metrics = staleMetrics.length;
      console.log(`[DataValidator] Cleaned ${staleMetrics.length} stale metrics`);
    }

    // 3. Validate remaining VPS configs
    const { data: vpsConfigs, error: vpsError } = await supabase
      .from('vps_config')
      .select('id, provider, outbound_ip, status');
    
    if (vpsError) {
      results.errors.push(`VPS query error: ${vpsError.message}`);
    } else {
      results.validated.vps_configs = vpsConfigs?.length || 0;
      
      // Check for valid IP format
      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      
      for (const vps of vpsConfigs || []) {
        if (vps.outbound_ip && !ipRegex.test(vps.outbound_ip)) {
          // Invalid IP format - mark as not configured
          await supabase
            .from('vps_config')
            .update({ outbound_ip: null, status: 'not_configured' })
            .eq('id', vps.id);
          
          results.cleaned.invalid_credentials++;
          console.log(`[DataValidator] Invalidated VPS ${vps.provider} with bad IP: ${vps.outbound_ip}`);
        }
      }
    }

    // 4. Validate exchange connections
    const { data: exchanges, error: exchangeError } = await supabase
      .from('exchange_connections')
      .select('id, exchange_name, is_connected, api_key');
    
    if (exchangeError) {
      results.errors.push(`Exchange query error: ${exchangeError.message}`);
    } else {
      results.validated.exchange_connections = exchanges?.length || 0;
      
      // Mark exchanges without API keys as disconnected
      for (const exchange of exchanges || []) {
        if (exchange.is_connected && !exchange.api_key) {
          await supabase
            .from('exchange_connections')
            .update({ is_connected: false })
            .eq('id', exchange.id);
          
          console.log(`[DataValidator] Disconnected exchange ${exchange.exchange_name} - no API key`);
        }
      }
    }

    // 5. Clean up credential permissions with invalid ranges
    const { data: invalidPerms } = await supabase
      .from('credential_permissions')
      .delete()
      .or('whitelisted_range.ilike.%127.0.0.1%,whitelisted_range.ilike.%192.168.%,whitelisted_range.ilike.%10.0.%')
      .select('id');
    
    if (invalidPerms) {
      results.cleaned.invalid_credentials += invalidPerms.length;
      console.log(`[DataValidator] Cleaned ${invalidPerms.length} invalid credential permissions`);
    }

    console.log('[DataValidator] Validation complete:', results);

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[DataValidator] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
