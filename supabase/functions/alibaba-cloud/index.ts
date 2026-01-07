import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Alibaba Cloud API Signature (HMAC-SHA1)
async function signAlibabaRequest(
  params: Record<string, string>,
  accessKeySecret: string
): Promise<string> {
  const sortedParams = Object.keys(params).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
  
  const stringToSign = `POST&${encodeURIComponent('/')}&${encodeURIComponent(sortedParams)}`;
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(accessKeySecret + '&'),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// Make Alibaba ECS API request
async function alibabaRequest(
  action: string,
  regionId: string,
  params: Record<string, string>,
  accessKeyId: string,
  accessKeySecret: string
): Promise<any> {
  const timestamp = new Date().toISOString().replace(/\.\d{3}/, '');
  const nonce = crypto.randomUUID();

  const baseParams: Record<string, string> = {
    Format: 'JSON',
    Version: '2014-05-26',
    AccessKeyId: accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    Timestamp: timestamp,
    SignatureVersion: '1.0',
    SignatureNonce: nonce,
    Action: action,
    RegionId: regionId,
    ...params
  };

  const signature = await signAlibabaRequest(baseParams, accessKeySecret);
  baseParams.Signature = signature;

  const response = await fetch('https://ecs.aliyuncs.com/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(baseParams).toString()
  });

  const data = await response.json();
  
  if (data.Code) {
    throw new Error(`Alibaba API Error: ${data.Code} - ${data.Message}`);
  }

  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      action, 
      accessKeyId, 
      accessKeySecret, 
      region = 'ap-northeast-1', // Tokyo
      instanceId,
      instanceType = 'ecs.t6-c1m1.large'
    } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    switch (action) {
      case 'validate-credentials': {
        // Describe regions to validate credentials
        const result = await alibabaRequest(
          'DescribeRegions',
          region,
          {},
          accessKeyId,
          accessKeySecret
        );

        const regions = result.Regions?.Region || [];
        const tokyoRegion = regions.find((r: any) => r.RegionId === 'ap-northeast-1');

        return new Response(JSON.stringify({
          success: true,
          regions: regions.length,
          tokyoAvailable: !!tokyoRegion,
          message: 'Alibaba Cloud credentials validated successfully'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'deploy-instance': {
        // Get available zones
        const zonesResult = await alibabaRequest(
          'DescribeZones',
          region,
          {},
          accessKeyId,
          accessKeySecret
        );
        
        const zones = zonesResult.Zones?.Zone || [];
        const zoneId = zones[0]?.ZoneId;

        if (!zoneId) {
          throw new Error('No available zones in the region');
        }

        // Create security group
        const sgResult = await alibabaRequest(
          'CreateSecurityGroup',
          region,
          {
            SecurityGroupName: `hft-bot-sg-${Date.now()}`,
            Description: 'HFT Bot Security Group'
          },
          accessKeyId,
          accessKeySecret
        );

        const securityGroupId = sgResult.SecurityGroupId;

        // Authorize security group rules
        const ports = ['22', '8080', '443'];
        for (const port of ports) {
          await alibabaRequest(
            'AuthorizeSecurityGroup',
            region,
            {
              SecurityGroupId: securityGroupId,
              IpProtocol: 'tcp',
              PortRange: `${port}/${port}`,
              SourceCidrIp: '0.0.0.0/0'
            },
            accessKeyId,
            accessKeySecret
          );
        }

        // Create instance
        const createResult = await alibabaRequest(
          'CreateInstance',
          region,
          {
            ZoneId: zoneId,
            ImageId: 'ubuntu_24_04_x64_20G_alibase_20240124.vhd',
            InstanceType: instanceType,
            SecurityGroupId: securityGroupId,
            InstanceName: 'HFT-Bot-Tokyo',
            InternetChargeType: 'PayByTraffic',
            InternetMaxBandwidthOut: '100',
            SystemDisk_Category: 'cloud_efficiency',
            SystemDisk_Size: '40'
          },
          accessKeyId,
          accessKeySecret
        );

        const createdInstanceId = createResult.InstanceId;

        // Allocate public IP
        await alibabaRequest(
          'AllocatePublicIpAddress',
          region,
          { InstanceId: createdInstanceId },
          accessKeyId,
          accessKeySecret
        );

        // Start instance
        await alibabaRequest(
          'StartInstance',
          region,
          { InstanceId: createdInstanceId },
          accessKeyId,
          accessKeySecret
        );

        // Log timeline event
        await supabase.from('vps_timeline_events').insert({
          provider: 'Alibaba',
          event_type: 'deployment',
          event_subtype: 'started',
          title: 'Alibaba ECS Instance Launching',
          description: `Instance ${createdInstanceId} is being created in ${region}`,
          metadata: { instanceId: createdInstanceId, instanceType, region, zoneId }
        });

        // Store config
        await supabase.from('cloud_config').upsert({
          provider: 'alibaba',
          region,
          instance_type: instanceType,
          is_active: true,
          status: 'deploying',
          credentials: { accessKeyId, instanceId: createdInstanceId, securityGroupId }
        }, { onConflict: 'provider' });

        return new Response(JSON.stringify({
          success: true,
          instanceId: createdInstanceId,
          securityGroupId,
          region,
          message: 'Alibaba ECS instance is being launched'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get-instance-status': {
        const result = await alibabaRequest(
          'DescribeInstances',
          region,
          { InstanceIds: JSON.stringify([instanceId]) },
          accessKeyId,
          accessKeySecret
        );

        const instances = result.Instances?.Instance || [];
        const instance = instances[0];

        if (!instance) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Instance not found'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const publicIp = instance.PublicIpAddress?.IpAddress?.[0];
        const status = instance.Status;

        if (status === 'Running' && publicIp) {
          await supabase.from('vps_config').upsert({
            provider: 'alibaba',
            region,
            status: 'running',
            outbound_ip: publicIp,
            instance_type: instanceType
          }, { onConflict: 'provider' });

          await supabase.from('cloud_config').update({ status: 'running' }).eq('provider', 'alibaba');

          await supabase.from('failover_config').upsert({
            provider: 'alibaba',
            region,
            is_enabled: true,
            health_check_url: `http://${publicIp}:8080/health`
          }, { onConflict: 'provider' });

          await supabase.from('vps_timeline_events').insert({
            provider: 'Alibaba',
            event_type: 'deployment',
            event_subtype: 'completed',
            title: 'Alibaba ECS Instance Ready',
            description: `Instance is running at ${publicIp}`,
            metadata: { instanceId, publicIp, status }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          instanceId,
          status,
          publicIp,
          privateIp: instance.InnerIpAddress?.IpAddress?.[0]
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'stop-instance': {
        await alibabaRequest(
          'StopInstance',
          region,
          { InstanceId: instanceId },
          accessKeyId,
          accessKeySecret
        );

        await supabase.from('cloud_config').update({ status: 'stopped' }).eq('provider', 'alibaba');
        await supabase.from('vps_config').update({ status: 'stopped' }).eq('provider', 'alibaba');

        await supabase.from('vps_timeline_events').insert({
          provider: 'Alibaba',
          event_type: 'deployment',
          event_subtype: 'stopped',
          title: 'Alibaba ECS Instance Stopped',
          description: `Instance ${instanceId} has been stopped`,
          metadata: { instanceId }
        });

        return new Response(JSON.stringify({
          success: true,
          message: 'Instance is being stopped'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'start-instance': {
        await alibabaRequest(
          'StartInstance',
          region,
          { InstanceId: instanceId },
          accessKeyId,
          accessKeySecret
        );

        await supabase.from('cloud_config').update({ status: 'starting' }).eq('provider', 'alibaba');

        await supabase.from('vps_timeline_events').insert({
          provider: 'Alibaba',
          event_type: 'deployment',
          event_subtype: 'started',
          title: 'Alibaba ECS Instance Starting',
          description: `Instance ${instanceId} is being started`,
          metadata: { instanceId }
        });

        return new Response(JSON.stringify({
          success: true,
          message: 'Instance is being started'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'terminate-instance': {
        // Stop first, then delete
        try {
          await alibabaRequest(
            'StopInstance',
            region,
            { InstanceId: instanceId, ForceStop: 'true' },
            accessKeyId,
            accessKeySecret
          );
          
          // Wait a moment for stop
          await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (e) {
          console.log('Instance might already be stopped');
        }

        await alibabaRequest(
          'DeleteInstance',
          region,
          { InstanceId: instanceId, Force: 'true' },
          accessKeyId,
          accessKeySecret
        );

        await supabase.from('cloud_config').update({ 
          status: 'terminated',
          is_active: false 
        }).eq('provider', 'alibaba');
        await supabase.from('vps_config').delete().eq('provider', 'alibaba');
        await supabase.from('failover_config').update({ is_enabled: false }).eq('provider', 'alibaba');

        await supabase.from('vps_timeline_events').insert({
          provider: 'Alibaba',
          event_type: 'deployment',
          event_subtype: 'terminated',
          title: 'Alibaba ECS Instance Terminated',
          description: `Instance ${instanceId} has been terminated`,
          metadata: { instanceId }
        });

        return new Response(JSON.stringify({
          success: true,
          message: 'Instance is being terminated'
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
    console.error('Alibaba Cloud Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
