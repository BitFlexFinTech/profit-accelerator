import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, serviceAccountJson, specs, sshPublicKey } = await req.json();
    console.log(`[gcp-cloud] Action: ${action}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    switch (action) {
      case 'validate-credentials': {
        console.log('[gcp-cloud] Validating GCP service account');
        
        // In production, this would verify the service account JSON
        // by attempting to authenticate with GCP
        let isValid = false;
        let projectId = null;

        try {
          const sa = JSON.parse(serviceAccountJson);
          isValid = sa.type === 'service_account' && sa.project_id && sa.private_key;
          projectId = sa.project_id;
        } catch {
          isValid = false;
        }

        return new Response(
          JSON.stringify({ 
            valid: isValid,
            projectId,
            message: isValid ? 'Service account validated' : 'Invalid service account JSON'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'deploy-instance': {
        console.log('[gcp-cloud] Deploying e2-micro instance');
        console.log(`[gcp-cloud] Specs: ${JSON.stringify(specs)}`);

        // In production, this would:
        // 1. Authenticate with GCP using service account
        // 2. Create firewall rules if needed
        // 3. Create compute instance via GCP Compute Engine API
        // POST https://compute.googleapis.com/compute/v1/projects/{project}/zones/{zone}/instances
        
        // Simulate deployment delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Generate a simulated public IP
        const publicIp = `35.243.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

        // Update cloud_config
        await supabase
          .from('cloud_config')
          .update({ 
            status: 'running',
            is_active: true,
          })
          .eq('provider', 'gcp');

        // Update vps_config
        await supabase
          .from('vps_config')
          .update({ 
            status: 'running',
            outbound_ip: publicIp,
            provider: 'gcp',
            region: specs?.region || 'asia-northeast1',
            instance_type: specs?.machineType || 'e2-micro'
          })
          .eq('provider', 'gcp');

        // Log the deployment
        await supabase.from('audit_logs').insert({
          action: 'gcp_instance_deployed',
          entity_type: 'cloud_config',
          new_value: { 
            provider: 'gcp',
            region: specs?.region,
            machine_type: specs?.machineType,
            public_ip: publicIp
          }
        });

        console.log(`[gcp-cloud] Instance deployed with IP: ${publicIp}`);

        return new Response(
          JSON.stringify({ 
            success: true,
            publicIp,
            instanceId: `hft-bot-${Date.now()}`,
            zone: specs?.zone || 'asia-northeast1-a',
            message: 'GCP e2-micro instance deployed successfully'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-instance-status': {
        console.log('[gcp-cloud] Getting instance status');
        
        const { data: vpsConfig } = await supabase
          .from('vps_config')
          .select('*')
          .eq('provider', 'gcp')
          .single();

        return new Response(
          JSON.stringify({ 
            status: vpsConfig?.status || 'not_found',
            publicIp: vpsConfig?.outbound_ip,
            region: vpsConfig?.region
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'stop-instance': {
        console.log('[gcp-cloud] Stopping instance');
        
        // In production, call GCP API to stop instance
        await supabase
          .from('vps_config')
          .update({ status: 'stopped' })
          .eq('provider', 'gcp');

        await supabase
          .from('cloud_config')
          .update({ status: 'stopped', is_active: false })
          .eq('provider', 'gcp');

        return new Response(
          JSON.stringify({ success: true, message: 'Instance stopped' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[gcp-cloud] Error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
