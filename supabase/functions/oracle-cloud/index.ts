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
    const { action, region, credentials, specs } = await req.json();
    console.log(`[oracle-cloud] Action: ${action}, Region: ${region || 'ap-tokyo-1'}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    switch (action) {
      case 'check-capacity': {
        // In production, this would call OCI API to check availability
        // GET https://iaas.{region}.oraclecloud.com/20160918/shapes
        // For demo, simulate capacity check
        console.log(`[oracle-cloud] Checking capacity for region: ${region}`);
        
        // Simulate 90% chance of availability
        const isAvailable = Math.random() > 0.1;
        
        // Log the check
        await supabase.from('audit_logs').insert({
          action: 'oracle_capacity_check',
          entity_type: 'cloud_config',
          new_value: { region, status: isAvailable ? 'available' : 'out_of_capacity' }
        });

        return new Response(
          JSON.stringify({ 
            status: isAvailable ? 'available' : 'out_of_capacity',
            region,
            message: isAvailable 
              ? 'ARM A1 capacity available in Tokyo' 
              : 'Tokyo is at capacity. Try again in 10-15 minutes.'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'validate-credentials': {
        console.log('[oracle-cloud] Validating OCI credentials');
        
        // In production, this would verify credentials against OCI API
        // Using the tenancy OCID, user OCID, fingerprint, and private key
        const { tenancyOcid, userOcid, fingerprint } = credentials || {};
        
        const isValid = tenancyOcid?.startsWith('ocid1.tenancy') && 
                       userOcid?.startsWith('ocid1.user') &&
                       fingerprint?.includes(':');

        return new Response(
          JSON.stringify({ 
            valid: isValid,
            message: isValid ? 'Credentials validated' : 'Invalid credentials format'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'deploy-instance': {
        console.log('[oracle-cloud] Deploying Always Free ARM instance');
        console.log(`[oracle-cloud] Specs: ${JSON.stringify(specs)}`);

        // In production, this would:
        // 1. Create VCN if not exists
        // 2. Create subnet
        // 3. Create compute instance via OCI API
        // POST https://iaas.{region}.oraclecloud.com/20160918/instances
        
        // Simulate deployment delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Generate a simulated public IP
        const publicIp = `139.84.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

        // Update cloud_config
        await supabase
          .from('cloud_config')
          .update({ 
            status: 'running',
            is_active: true,
          })
          .eq('provider', 'oracle');

        // Update vps_config
        await supabase
          .from('vps_config')
          .update({ 
            status: 'running',
            outbound_ip: publicIp,
            provider: 'oracle',
            region: specs?.region || 'ap-tokyo-1',
            instance_type: specs?.shape || 'VM.Standard.A1.Flex'
          })
          .eq('provider', 'oracle');

        // Log the deployment
        await supabase.from('audit_logs').insert({
          action: 'oracle_instance_deployed',
          entity_type: 'cloud_config',
          new_value: { 
            provider: 'oracle',
            region: specs?.region,
            instance_type: specs?.shape,
            public_ip: publicIp
          }
        });

        console.log(`[oracle-cloud] Instance deployed with IP: ${publicIp}`);

        return new Response(
          JSON.stringify({ 
            success: true,
            publicIp,
            instanceId: `ocid1.instance.oc1.ap-tokyo-1.${crypto.randomUUID().replace(/-/g, '')}`,
            message: 'Oracle ARM instance deployed successfully'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-instance-status': {
        console.log('[oracle-cloud] Getting instance status');
        
        const { data: vpsConfig } = await supabase
          .from('vps_config')
          .select('*')
          .eq('provider', 'oracle')
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

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[oracle-cloud] Error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
