import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Provider pricing (monthly)
const PROVIDER_PRICING: Record<string, { monthly: number; free: boolean }> = {
  contabo: { monthly: 6.99, free: false },
  vultr: { monthly: 5.00, free: false },
  aws: { monthly: 8.35, free: true },
  digitalocean: { monthly: 4.00, free: false },
  gcp: { monthly: 0, free: true },
  oracle: { monthly: 0, free: true },
  alibaba: { monthly: 3.00, free: false },
  azure: { monthly: 0, free: true },
};

interface CostOptimization {
  id: string;
  action: 'switch_primary' | 'terminate' | 'downgrade';
  from_provider?: string;
  to_provider?: string;
  savings: number;
  latency_delta: number;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, optimizationId } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    switch (action) {
      case 'analyze': {
        // Get running providers
        const { data: failoverConfigs } = await supabase
          .from('failover_config')
          .select('*')
          .eq('is_enabled', true);

        if (!failoverConfigs || failoverConfigs.length === 0) {
          return new Response(JSON.stringify({
            success: true,
            totalCost: 0,
            optimizations: [],
            message: 'No running providers to analyze'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const optimizations: CostOptimization[] = [];
        let totalCost = 0;

        // Calculate current costs
        const runningProviders = failoverConfigs.map(fc => {
          const provider = fc.provider.toLowerCase();
          const pricing = PROVIDER_PRICING[provider];
          totalCost += pricing?.monthly || 0;
          return {
            provider,
            latency: fc.latency_ms || 999,
            isPrimary: fc.is_primary,
            cost: pricing?.monthly || 0,
            free: pricing?.free || false
          };
        });

        // Find primary provider
        const primaryProvider = runningProviders.find(p => p.isPrimary);
        const freeProviders = runningProviders.filter(p => p.free && p.latency < 500);
        const paidProviders = runningProviders.filter(p => !p.free);

        // Optimization 1: Switch to free tier if latency is comparable
        if (primaryProvider && !primaryProvider.free) {
          for (const freeProvider of freeProviders) {
            const latencyDelta = freeProvider.latency - primaryProvider.latency;
            
            // If free provider has acceptable latency (within 25ms)
            if (latencyDelta <= 25) {
              optimizations.push({
                id: `switch-${primaryProvider.provider}-to-${freeProvider.provider}`,
                action: 'switch_primary',
                from_provider: primaryProvider.provider,
                to_provider: freeProvider.provider,
                savings: primaryProvider.cost,
                latency_delta: latencyDelta,
                reason: `${freeProvider.provider.toUpperCase()} (FREE) has similar latency to ${primaryProvider.provider} (${freeProvider.latency}ms vs ${primaryProvider.latency}ms)`,
                priority: latencyDelta <= 10 ? 'high' : 'medium'
              });
            }
          }
        }

        // Optimization 2: Terminate redundant paid providers
        if (freeProviders.length >= 2) {
          for (const paidProvider of paidProviders) {
            if (!paidProvider.isPrimary) {
              // Find a free provider with similar or better latency
              const betterFree = freeProviders.find(fp => fp.latency <= paidProvider.latency + 20);
              if (betterFree) {
                optimizations.push({
                  id: `terminate-${paidProvider.provider}`,
                  action: 'terminate',
                  from_provider: paidProvider.provider,
                  savings: paidProvider.cost,
                  latency_delta: 0,
                  reason: `${paidProvider.provider} can be terminated - ${betterFree.provider} (FREE) provides similar failover capability`,
                  priority: 'medium'
                });
              }
            }
          }
        }

        // Optimization 3: If using expensive provider, suggest cheaper alternative
        const expensiveThreshold = 6;
        for (const provider of paidProviders) {
          if (provider.cost > expensiveThreshold) {
            const cheaperAlternatives = paidProviders.filter(
              p => p.provider !== provider.provider && 
                   p.cost < provider.cost &&
                   p.latency <= provider.latency + 15
            );
            
            if (cheaperAlternatives.length > 0) {
              const cheapest = cheaperAlternatives.sort((a, b) => a.cost - b.cost)[0];
              optimizations.push({
                id: `downgrade-${provider.provider}-to-${cheapest.provider}`,
                action: 'switch_primary',
                from_provider: provider.provider,
                to_provider: cheapest.provider,
                savings: provider.cost - cheapest.cost,
                latency_delta: cheapest.latency - provider.latency,
                reason: `Switch to ${cheapest.provider} to save $${(provider.cost - cheapest.cost).toFixed(2)}/mo with minimal latency impact`,
                priority: 'low'
              });
            }
          }
        }

        // Sort by priority and savings
        optimizations.sort((a, b) => {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
          }
          return b.savings - a.savings;
        });

        // Calculate potential savings
        const potentialSavings = optimizations.reduce((sum, opt) => sum + opt.savings, 0);

        // Store recommendations
        for (const opt of optimizations) {
          await supabase.from('cost_recommendations').upsert({
            recommendation_type: opt.action,
            current_provider: opt.from_provider,
            recommended_provider: opt.to_provider,
            current_monthly_cost: PROVIDER_PRICING[opt.from_provider || '']?.monthly || 0,
            recommended_monthly_cost: PROVIDER_PRICING[opt.to_provider || '']?.monthly || 0,
            savings_percent: opt.savings > 0 ? 100 : 0,
            reason: opt.reason,
            priority: opt.priority,
            is_dismissed: false
          }, { onConflict: 'recommendation_type,current_provider' });
        }

        return new Response(JSON.stringify({
          success: true,
          totalCost,
          potentialSavings,
          optimizations,
          runningProviders: runningProviders.length,
          freeProviders: freeProviders.length,
          paidProviders: paidProviders.length
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'apply-optimization': {
        if (!optimizationId) {
          throw new Error('Optimization ID required');
        }

        // Parse optimization ID
        const [actionType, ...rest] = optimizationId.split('-');
        
        if (actionType === 'switch') {
          const fromProvider = rest[0];
          const toProvider = rest[rest.length - 1];

          // Update primary status
          await supabase.from('failover_config')
            .update({ is_primary: false })
            .eq('provider', fromProvider);
          
          await supabase.from('failover_config')
            .update({ is_primary: true })
            .eq('provider', toProvider);

          // Log event
          await supabase.from('vps_timeline_events').insert({
            provider: toProvider,
            event_type: 'cost_optimization',
            event_subtype: 'switch_primary',
            title: 'Cost Optimization Applied',
            description: `Switched primary from ${fromProvider} to ${toProvider}`,
            metadata: { fromProvider, toProvider, optimizationId }
          });

          // Mark recommendation as applied
          await supabase.from('cost_recommendations')
            .update({ is_dismissed: true })
            .eq('current_provider', fromProvider)
            .eq('recommended_provider', toProvider);

          return new Response(JSON.stringify({
            success: true,
            action: 'switch_primary',
            from: fromProvider,
            to: toProvider,
            message: `Primary switched to ${toProvider}`
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (actionType === 'terminate') {
          const provider = rest[0];

          // Terminate the provider (call its cloud function)
          await supabase.functions.invoke(`${provider}-cloud`, {
            body: { action: 'terminate-instance' }
          });

          await supabase.from('vps_timeline_events').insert({
            provider,
            event_type: 'cost_optimization',
            event_subtype: 'terminated',
            title: 'Cost Optimization: Instance Terminated',
            description: `${provider} instance terminated to reduce costs`,
            metadata: { provider, optimizationId }
          });

          return new Response(JSON.stringify({
            success: true,
            action: 'terminate',
            provider,
            message: `${provider} instance terminated`
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        throw new Error('Unknown optimization type');
      }

      case 'generate-weekly-report': {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Get cost data for the week
        const { data: costAnalysis } = await supabase
          .from('cost_analysis')
          .select('*')
          .gte('analysis_date', weekAgo.toISOString().split('T')[0])
          .order('analysis_date', { ascending: true });

        // Get optimization events
        const { data: optimizationEvents } = await supabase
          .from('vps_timeline_events')
          .select('*')
          .eq('event_type', 'cost_optimization')
          .gte('created_at', weekAgo.toISOString());

        // Calculate totals
        const totalCostBefore = costAnalysis?.reduce((sum, c) => sum + (c.total_cost || 0), 0) || 0;
        const optimizationsSavings = optimizationEvents?.length || 0;
        
        // Get current running providers
        const { data: currentProviders } = await supabase
          .from('failover_config')
          .select('provider')
          .eq('is_enabled', true);

        const currentMonthlyProjection = (currentProviders || []).reduce((sum, p) => {
          const pricing = PROVIDER_PRICING[p.provider.toLowerCase()];
          return sum + (pricing?.monthly || 0);
        }, 0);

        // Create report
        const report = {
          report_date: now.toISOString().split('T')[0],
          period_start: weekAgo.toISOString(),
          period_end: now.toISOString(),
          total_cost_before: totalCostBefore,
          total_cost_after: currentMonthlyProjection * 0.25, // Weekly
          savings: Math.max(0, totalCostBefore - currentMonthlyProjection * 0.25),
          optimizations_applied: optimizationEvents?.map(e => ({
            type: e.event_subtype,
            provider: e.provider,
            date: e.created_at
          })) || [],
          recommendations: []
        };

        // Store report
        const { data: savedReport } = await supabase
          .from('cost_optimization_reports')
          .insert(report)
          .select()
          .single();

        // Send Telegram notification
        const { data: telegramConfig } = await supabase
          .from('telegram_config')
          .select('*')
          .eq('notifications_enabled', true)
          .single();

        if (telegramConfig?.bot_token && telegramConfig?.chat_id) {
          const providerBreakdown = (currentProviders || [])
            .map(p => {
              const pricing = PROVIDER_PRICING[p.provider.toLowerCase()];
              return `• ${p.provider}: ${pricing?.free ? 'FREE' : `$${pricing?.monthly?.toFixed(2)}`}`;
            })
            .join('\n');

          const message = `📊 <b>WEEKLY COST REPORT</b>\n\n` +
            `Period: ${weekAgo.toLocaleDateString()} - ${now.toLocaleDateString()}\n\n` +
            `<b>Running Providers:</b>\n${providerBreakdown || 'None'}\n\n` +
            `<b>Monthly Projection:</b> $${currentMonthlyProjection.toFixed(2)}\n` +
            `<b>Weekly Cost:</b> $${(currentMonthlyProjection * 0.25).toFixed(2)}\n\n` +
            (optimizationEvents && optimizationEvents.length > 0 
              ? `<b>Optimizations Applied:</b> ${optimizationEvents.length}\n` +
                `<b>Estimated Savings:</b> $${report.savings.toFixed(2)}\n`
              : `💡 Run cost analysis to find savings opportunities!`);

          await fetch(`https://api.telegram.org/bot${telegramConfig.bot_token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramConfig.chat_id,
              text: message,
              parse_mode: 'HTML'
            })
          });
        }

        return new Response(JSON.stringify({
          success: true,
          report: savedReport
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get-savings-history': {
        const { data: reports } = await supabase
          .from('cost_optimization_reports')
          .select('*')
          .order('report_date', { ascending: false })
          .limit(12);

        const totalSavings = (reports || []).reduce((sum, r) => sum + (r.savings || 0), 0);

        return new Response(JSON.stringify({
          success: true,
          reports,
          totalSavings
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({
          error: `Unknown action: ${action}`
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error: unknown) {
    console.error('Cost Optimizer Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
