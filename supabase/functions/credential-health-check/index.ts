import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TELEGRAM_API = 'https://api.telegram.org/bot';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action } = await req.json();
    console.log(`[credential-health-check] Action: ${action}`);

    switch (action) {
      case 'run-daily-check': {
        const results: any[] = [];
        const criticalIssues: string[] = [];
        const warningIssues: string[] = [];
        const infoIssues: string[] = [];

        // Get all credentials
        const { data: credentials } = await supabase
          .from('credential_vault')
          .select('*');

        // Get credential permissions
        const { data: permissions } = await supabase
          .from('credential_permissions')
          .select('*');

        // Check each credential
        permissions?.forEach(perm => {
          const now = new Date();

          // Check for expiry (within 7 days)
          if (perm.expiry_date) {
            const expiryDate = new Date(perm.expiry_date);
            const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
              warningIssues.push(`${perm.provider} API: Expires in ${daysUntilExpiry} days`);
              results.push({
                check_type: 'credential',
                provider: perm.provider,
                status: 'warning',
                message: `Expires in ${daysUntilExpiry} days`,
              });
            } else if (daysUntilExpiry <= 0) {
              criticalIssues.push(`${perm.provider} API: EXPIRED`);
              results.push({
                check_type: 'credential',
                provider: perm.provider,
                status: 'critical',
                message: 'API key has expired',
              });
            }
          }

          // Check for withdrawal permission
          if (perm.can_withdraw) {
            criticalIssues.push(`${perm.provider} API: Withdrawal permission enabled`);
            results.push({
              check_type: 'credential',
              provider: perm.provider,
              status: 'critical',
              message: 'Withdrawal permission enabled',
            });
          }

          // Check for IP restriction
          if (!perm.ip_restricted) {
            warningIssues.push(`${perm.provider} API: No IP restriction`);
            results.push({
              check_type: 'credential',
              provider: perm.provider,
              status: 'warning',
              message: 'No IP restriction configured',
            });
          }

          // Check for rotation (> 90 days)
          if (perm.last_analyzed_at) {
            const lastRotation = new Date(perm.last_analyzed_at);
            const daysSinceRotation = Math.floor((now.getTime() - lastRotation.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceRotation > 90) {
              infoIssues.push(`${perm.provider} API: No rotation in ${daysSinceRotation} days`);
              results.push({
                check_type: 'credential',
                provider: perm.provider,
                status: 'info',
                message: `No rotation in ${daysSinceRotation} days`,
              });
            }
          }
        });

        // Store results
        for (const result of results) {
          await supabase.from('health_check_results').insert({
            ...result,
            telegram_notified: false,
          });
        }

        // Send Telegram alert if any issues found
        if (criticalIssues.length > 0 || warningIssues.length > 0) {
          const { data: telegramConfig } = await supabase
            .from('telegram_config')
            .select('bot_token, chat_id, notifications_enabled')
            .single();

          if (telegramConfig?.bot_token && telegramConfig?.chat_id && telegramConfig.notifications_enabled) {
            // Calculate overall score
            let score = 100;
            criticalIssues.forEach(() => score -= 25);
            warningIssues.forEach(() => score -= 10);
            infoIssues.forEach(() => score -= 3);
            score = Math.max(0, score);

            let message = '🔐 <b>DAILY SECURITY REPORT</b>\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

            if (criticalIssues.length > 0) {
              message += `🚨 <b>CRITICAL (${criticalIssues.length} issues)</b>\n`;
              criticalIssues.forEach(issue => {
                message += `• ${issue}\n`;
              });
              message += '\n';
            }

            if (warningIssues.length > 0) {
              message += `⚠️ <b>WARNING (${warningIssues.length} issues)</b>\n`;
              warningIssues.forEach(issue => {
                message += `• ${issue}\n`;
              });
              message += '\n';
            }

            if (infoIssues.length > 0) {
              message += `ℹ️ <b>INFO (${infoIssues.length} issues)</b>\n`;
              infoIssues.forEach(issue => {
                message += `• ${issue}\n`;
              });
              message += '\n';
            }

            message += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
            message += `Overall Security Score: <b>${score}/100</b>\n\n`;
            message += '🔧 Run /security in Telegram or visit\nthe dashboard to fix these issues.';

            await fetch(`${TELEGRAM_API}${telegramConfig.bot_token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: telegramConfig.chat_id,
                text: message,
                parse_mode: 'HTML',
              }),
            });

            // Mark as notified
            await supabase
              .from('health_check_results')
              .update({ telegram_notified: true })
              .eq('telegram_notified', false);

            console.log('[credential-health-check] Telegram alert sent');
          }
        }

        console.log(`[credential-health-check] Check complete. Critical: ${criticalIssues.length}, Warning: ${warningIssues.length}, Info: ${infoIssues.length}`);
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            summary: {
              critical: criticalIssues.length,
              warning: warningIssues.length,
              info: infoIssues.length,
            }
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
    console.error('[credential-health-check] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});