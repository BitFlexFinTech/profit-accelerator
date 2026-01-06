import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    console.log(`[security-analyzer] Action: ${action}`, params);

    switch (action) {
      case 'scan-all': {
        // Scan all credentials and check for security issues
        const issues: any[] = [];

        // Get exchange connections
        const { data: exchanges } = await supabase
          .from('exchange_connections')
          .select('*')
          .eq('is_connected', true);

        // Get credential vault entries
        const { data: credentials } = await supabase
          .from('credential_vault')
          .select('*');

        // Get credential permissions
        const { data: permissions } = await supabase
          .from('credential_permissions')
          .select('*');

        // Analyze each credential for security issues
        permissions?.forEach(perm => {
          // Check for withdrawal permission
          if (perm.can_withdraw) {
            issues.push({
              id: `${perm.provider}-withdraw`,
              provider: perm.provider,
              credentialType: perm.credential_type,
              severity: 'critical',
              message: 'Withdrawal permission enabled',
              recommendation: 'Disable withdrawal permission for trading API',
              canAutoFix: ['binance', 'bybit', 'okx'].includes(perm.provider.toLowerCase()),
            });
          }

          // Check for IP restriction
          if (!perm.ip_restricted) {
            issues.push({
              id: `${perm.provider}-no-ip`,
              provider: perm.provider,
              credentialType: perm.credential_type,
              severity: 'warning',
              message: 'No IP restriction configured',
              recommendation: 'Add VPS IP 167.179.83.239 to whitelist',
              canAutoFix: true,
            });
          }

          // Check for key rotation
          if (perm.last_analyzed_at) {
            const lastRotation = new Date(perm.last_analyzed_at);
            const daysSinceRotation = Math.floor((Date.now() - lastRotation.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceRotation > 90) {
              issues.push({
                id: `${perm.provider}-rotation`,
                provider: perm.provider,
                credentialType: perm.credential_type,
                severity: 'info',
                message: `API key not rotated in ${daysSinceRotation} days`,
                recommendation: 'Rotate API key for security best practices',
                canAutoFix: false,
              });
            }
          }

          // Check for excess scopes
          if (perm.excess_scopes && perm.excess_scopes.length > 0) {
            issues.push({
              id: `${perm.provider}-scopes`,
              provider: perm.provider,
              credentialType: perm.credential_type,
              severity: 'warning',
              message: `${perm.excess_scopes.length} unnecessary permissions detected`,
              recommendation: `Remove: ${perm.excess_scopes.join(', ')}`,
              canAutoFix: true,
            });
          }
        });

        // Calculate overall score
        let score = 100;
        issues.forEach(issue => {
          switch (issue.severity) {
            case 'critical': score -= 25; break;
            case 'warning': score -= 10; break;
            case 'info': score -= 3; break;
          }
        });
        score = Math.max(0, score);

        // Update security_scores table
        await supabase.from('security_scores').upsert({
          id: crypto.randomUUID(),
          overall_score: score,
          exchange_score: Math.max(0, 100 - issues.filter(i => i.credentialType === 'exchange').length * 15),
          cloud_score: Math.max(0, 100 - issues.filter(i => i.credentialType === 'cloud').length * 15),
          integration_score: Math.max(0, 100 - issues.filter(i => i.credentialType === 'integration').length * 15),
          recommendations: issues.map(i => i.recommendation),
          analyzed_at: new Date().toISOString(),
        });

        console.log(`[security-analyzer] Found ${issues.length} issues, score: ${score}`);
        return new Response(
          JSON.stringify({ success: true, issues, score }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'analyze-exchange': {
        const { provider, apiKey, apiSecret } = params;
        
        // Provider-specific API permission checks
        let permissions = {
          canRead: true,
          canTrade: false,
          canWithdraw: false,
          ipRestricted: false,
          detectedScopes: [] as string[],
        };

        // Note: In production, these would make actual API calls to check permissions
        console.log(`[security-analyzer] Analyzing ${provider} exchange permissions`);

        return new Response(
          JSON.stringify({ success: true, permissions }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'calculate-score': {
        const { data: permissions } = await supabase
          .from('credential_permissions')
          .select('*');

        let score = 100;
        
        permissions?.forEach(perm => {
          if (perm.can_withdraw) score -= 25;
          if (!perm.ip_restricted) score -= 10;
          if (perm.excess_scopes?.length > 0) score -= 5 * perm.excess_scopes.length;
          if (!perm.has_expiry) score -= 5;
        });

        return new Response(
          JSON.stringify({ success: true, score: Math.max(0, score) }),
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
    console.error('[security-analyzer] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});