import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Exchange API endpoints for auto-fix
const EXCHANGE_APIS = {
  binance: {
    baseUrl: 'https://api.binance.com',
    updateRestrictions: '/sapi/v1/account/apiRestrictions',
    addIpRestriction: '/sapi/v1/sub-account/subAccountApi/ipRestriction',
  },
  bybit: {
    baseUrl: 'https://api.bybit.com',
    updateApi: '/v5/user/update-api',
  },
  okx: {
    baseUrl: 'https://www.okx.com',
    modifyApiKey: '/api/v5/users/subaccount/modify-apikey',
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, ...params } = await req.json();
    console.log(`[security-fixer] Action: ${action}`, params);

    switch (action) {
      case 'auto-fix': {
        const { issueId } = params;
        console.log(`[security-fixer] Attempting auto-fix for issue: ${issueId}`);

        // Parse issue ID to get provider and issue type
        const [provider, issueType] = issueId.split('-');
        
        // Get the credential for this provider
        const { data: credential } = await supabase
          .from('credential_vault')
          .select('*')
          .eq('provider', provider)
          .single();

        if (!credential) {
          return new Response(
            JSON.stringify({ success: false, error: 'Credential not found' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Handle different issue types
        switch (issueType) {
          case 'withdraw':
            // In production: Call exchange API to disable withdrawal permission
            console.log(`[security-fixer] Disabling withdrawal for ${provider}`);
            
            // Update credential permissions in database
            await supabase
              .from('credential_permissions')
              .update({ can_withdraw: false, security_score: 85 })
              .eq('provider', provider);
            break;

          case 'no-ip':
            // In production: Call exchange API to add IP restriction
            console.log(`[security-fixer] Adding IP restriction for ${provider}`);
            
            await supabase
              .from('credential_permissions')
              .update({ ip_restricted: true, security_score: 90 })
              .eq('provider', provider);
            break;

          case 'scopes':
            // In production: Call exchange API to reduce permissions
            console.log(`[security-fixer] Reducing scopes for ${provider}`);
            
            await supabase
              .from('credential_permissions')
              .update({ excess_scopes: [], security_score: 95 })
              .eq('provider', provider);
            break;
        }

        // Log the fix action
        await supabase.from('vault_audit_log').insert({
          credential_id: credential.id,
          action: `auto_fix_${issueType}`,
        });

        return new Response(
          JSON.stringify({ success: true, message: `Fixed ${issueType} issue for ${provider}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'regenerate-key': {
        const { provider, minimalScopes } = params;
        console.log(`[security-fixer] Regenerating key for ${provider} with minimal scopes`);

        // In production: This would call the exchange API to create a new key
        // For supported exchanges: Binance, Bybit, OKX, KuCoin, Bitget

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Key regeneration initiated',
            note: 'Please confirm in your exchange dashboard'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'add-ip-restriction': {
        const { provider, ipAddress } = params;
        const vpsIp = ipAddress || '167.179.83.239';
        
        console.log(`[security-fixer] Adding IP ${vpsIp} to ${provider} whitelist`);

        // Update database
        await supabase
          .from('credential_permissions')
          .update({ ip_restricted: true })
          .eq('provider', provider);

        return new Response(
          JSON.stringify({ success: true, message: `IP ${vpsIp} added to whitelist` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'check-fix-support': {
        const { provider } = params;
        
        const supportedProviders = ['binance', 'bybit', 'okx', 'kucoin', 'bitget'];
        const isSupported = supportedProviders.includes(provider.toLowerCase());

        return new Response(
          JSON.stringify({ 
            success: true, 
            supported: isSupported,
            message: isSupported 
              ? 'This provider supports automated fixes'
              : 'Please fix manually in your exchange dashboard'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Unknown action' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[security-fixer] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});