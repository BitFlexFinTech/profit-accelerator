import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OCI API base URLs by region
const OCI_REGIONS: Record<string, string> = {
  'ap-tokyo-1': 'iaas.ap-tokyo-1.oraclecloud.com',
  'ap-osaka-1': 'iaas.ap-osaka-1.oraclecloud.com',
  'ap-singapore-1': 'iaas.ap-singapore-1.oraclecloud.com',
  'us-ashburn-1': 'iaas.us-ashburn-1.oraclecloud.com',
  'eu-frankfurt-1': 'iaas.eu-frankfurt-1.oraclecloud.com',
};

// Create OCI signature for API authentication (RSA-SHA256)
async function createOCISignature(
  privateKeyPem: string,
  method: string,
  path: string,
  host: string,
  date: string,
  contentLength?: number,
  contentType?: string,
  bodyHash?: string
): Promise<{ signature: string; headers: string }> {
  const headersToSign = ['date', '(request-target)', 'host'];
  if (method === 'POST' || method === 'PUT') {
    headersToSign.push('content-length', 'content-type', 'x-content-sha256');
  }

  // Build signing string
  const signingParts: string[] = [];
  for (const header of headersToSign) {
    if (header === '(request-target)') {
      signingParts.push(`(request-target): ${method.toLowerCase()} ${path}`);
    } else if (header === 'date') {
      signingParts.push(`date: ${date}`);
    } else if (header === 'host') {
      signingParts.push(`host: ${host}`);
    } else if (header === 'content-length' && contentLength !== undefined) {
      signingParts.push(`content-length: ${contentLength}`);
    } else if (header === 'content-type' && contentType) {
      signingParts.push(`content-type: ${contentType}`);
    } else if (header === 'x-content-sha256' && bodyHash) {
      signingParts.push(`x-content-sha256: ${bodyHash}`);
    }
  }
  const signingString = signingParts.join('\n');

  // Import RSA private key and sign with SHA-256
  const keyData = privateKeyPem
    .replace(/-----BEGIN.*?-----/g, '')
    .replace(/-----END.*?-----/g, '')
    .replace(/\s/g, '');
  const keyBuffer = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingString)
  );
  
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  
  return { signature, headers: headersToSign.join(' ') };
}

// Calculate SHA256 hash for request body
async function sha256Base64(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}

// Make authenticated OCI API request
async function ociRequest(
  method: string,
  path: string,
  region: string,
  credentials: {
    tenancyOcid: string;
    userOcid: string;
    fingerprint: string;
    privateKey: string;
  },
  body?: object
): Promise<{ data: unknown; status: number }> {
  const host = OCI_REGIONS[region] || OCI_REGIONS['ap-tokyo-1'];
  const date = new Date().toUTCString();
  const bodyStr = body ? JSON.stringify(body) : '';
  const bodyHash = body ? await sha256Base64(bodyStr) : undefined;
  
  const { signature, headers } = await createOCISignature(
    credentials.privateKey,
    method,
    path,
    host,
    date,
    body ? bodyStr.length : undefined,
    body ? 'application/json' : undefined,
    bodyHash
  );
  
  const keyId = `${credentials.tenancyOcid}/${credentials.userOcid}/${credentials.fingerprint}`;
  const authHeader = `Signature version="1",keyId="${keyId}",algorithm="rsa-sha256",headers="${headers}",signature="${signature}"`;
  
  const requestHeaders: Record<string, string> = {
    'date': date,
    'host': host,
    'Authorization': authHeader,
  };
  
  if (body) {
    requestHeaders['content-type'] = 'application/json';
    requestHeaders['content-length'] = bodyStr.length.toString();
    requestHeaders['x-content-sha256'] = bodyHash!;
  }
  
  const response = await fetch(`https://${host}${path}`, {
    method,
    headers: requestHeaders,
    body: body ? bodyStr : undefined,
  });
  
  const data = await response.json().catch(() => ({}));
  return { data, status: response.status };
}

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
    console.log(`[oracle-cloud] Action: ${action}`);

    switch (action) {
      case 'validate-credentials': {
        const { tenancyOcid, userOcid, fingerprint, privateKey, region = 'ap-tokyo-1' } = params;
        
        if (!tenancyOcid || !userOcid || !fingerprint || !privateKey) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing required credentials' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate credentials by listing instances
        const path = `/20160918/instances?compartmentId=${encodeURIComponent(tenancyOcid)}&limit=1`;
        const { data, status } = await ociRequest('GET', path, region, {
          tenancyOcid, userOcid, fingerprint, privateKey
        });

        if (status === 200) {
          console.log('[oracle-cloud] Credentials validated successfully');
          return new Response(
            JSON.stringify({ success: true, message: 'Credentials validated' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          console.error('[oracle-cloud] Validation failed:', data);
          return new Response(
            JSON.stringify({ success: false, error: 'Invalid credentials', details: data }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'check-capacity': {
        const { tenancyOcid, userOcid, fingerprint, privateKey, region = 'ap-tokyo-1' } = params;
        
        // Check if ARM A1 shape is available in the region
        const path = `/20160918/shapes?compartmentId=${encodeURIComponent(tenancyOcid)}`;
        const { data, status } = await ociRequest('GET', path, region, {
          tenancyOcid, userOcid, fingerprint, privateKey
        });

        if (status !== 200) {
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to check capacity', details: data }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const shapes = data as { shape: string; processorDescription: string }[];
        const armShape = shapes.find(s => s.shape === 'VM.Standard.A1.Flex');
        const hasCapacity = !!armShape;

        // Log capacity check
        await supabase.from('vps_timeline_events').insert({
          provider: 'oracle',
          event_type: 'capacity_check',
          title: hasCapacity ? 'ARM capacity available' : 'No ARM capacity',
          description: `Region: ${region}, Shape: VM.Standard.A1.Flex`,
          metadata: { region, hasCapacity, shapes: shapes.map(s => s.shape) }
        });

        return new Response(
          JSON.stringify({ 
            success: true, 
            hasCapacity,
            region,
            shape: 'VM.Standard.A1.Flex',
            message: hasCapacity ? 'ARM A1 capacity available' : 'No ARM capacity in this region'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'deploy-instance': {
        const { 
          tenancyOcid, userOcid, fingerprint, privateKey, 
          region = 'ap-tokyo-1', 
          subnetOcid, 
          sshPublicKey,
          displayName = 'hft-tokyo-arm'
        } = params;
        
        if (!subnetOcid || !sshPublicKey) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing subnetOcid or sshPublicKey' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get Ubuntu 24.04 ARM64 image for the region
        const imagesPath = `/20160918/images?compartmentId=${encodeURIComponent(tenancyOcid)}&operatingSystem=Canonical%20Ubuntu&operatingSystemVersion=24.04&shape=VM.Standard.A1.Flex&limit=1`;
        const { data: imagesData, status: imagesStatus } = await ociRequest('GET', imagesPath, region, {
          tenancyOcid, userOcid, fingerprint, privateKey
        });

        if (imagesStatus !== 200 || !(imagesData as unknown[]).length) {
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to find Ubuntu 24.04 ARM image' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const imageId = (imagesData as { id: string }[])[0].id;

        // Get availability domain
        const adsPath = `/20160918/availabilityDomains?compartmentId=${encodeURIComponent(tenancyOcid)}`;
        const { data: adsData, status: adsStatus } = await ociRequest('GET', adsPath, region, {
          tenancyOcid, userOcid, fingerprint, privateKey
        });

        if (adsStatus !== 200 || !(adsData as unknown[]).length) {
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to get availability domains' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const availabilityDomain = (adsData as { name: string }[])[0].name;

        // Launch Always Free ARM instance (4 OCPUs, 24GB RAM max)
        const launchPayload = {
          compartmentId: tenancyOcid,
          displayName,
          availabilityDomain,
          shape: 'VM.Standard.A1.Flex',
          shapeConfig: {
            ocpus: 4,
            memoryInGBs: 24
          },
          sourceDetails: {
            sourceType: 'image',
            imageId,
            bootVolumeSizeInGBs: 100
          },
          createVnicDetails: {
            subnetId: subnetOcid,
            assignPublicIp: true
          },
          metadata: {
            ssh_authorized_keys: sshPublicKey
          },
          freeformTags: {
            purpose: 'hft-trading-bot',
            createdBy: 'lovable-dashboard'
          }
        };

        const { data: instanceData, status: instanceStatus } = await ociRequest(
          'POST', '/20160918/instances', region, 
          { tenancyOcid, userOcid, fingerprint, privateKey },
          launchPayload
        );

        if (instanceStatus !== 200 && instanceStatus !== 201) {
          console.error('[oracle-cloud] Instance launch failed:', instanceData);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to launch instance', details: instanceData }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const instance = instanceData as { id: string; displayName: string; lifecycleState: string };
        console.log('[oracle-cloud] Instance launched:', instance.id);

        // Update cloud_config
        await supabase.from('cloud_config').upsert({
          provider: 'oracle',
          region,
          instance_type: 'VM.Standard.A1.Flex',
          status: 'deploying',
          is_active: true,
          use_free_tier: true,
          credentials: { tenancyOcid, userOcid, fingerprint, instanceId: instance.id }
        }, { onConflict: 'provider' });

        // Log deployment event
        await supabase.from('vps_timeline_events').insert({
          provider: 'oracle',
          event_type: 'deployment',
          event_subtype: 'instance_launch',
          title: 'ARM instance launched',
          description: `Instance ${instance.displayName} (${instance.id}) deploying`,
          metadata: { instanceId: instance.id, region, shape: 'VM.Standard.A1.Flex' }
        });

        return new Response(
          JSON.stringify({ 
            success: true, 
            instanceId: instance.id,
            displayName: instance.displayName,
            status: instance.lifecycleState,
            message: 'Always Free ARM instance launched successfully'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-instance-status': {
        const { tenancyOcid, userOcid, fingerprint, privateKey, instanceId, region = 'ap-tokyo-1' } = params;
        
        if (!instanceId) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing instanceId' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const path = `/20160918/instances/${instanceId}`;
        const { data, status } = await ociRequest('GET', path, region, {
          tenancyOcid, userOcid, fingerprint, privateKey
        });

        if (status !== 200) {
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to get instance status', details: data }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const instance = data as { 
          id: string; 
          displayName: string; 
          lifecycleState: string;
          timeCreated: string;
        };

        // Get VNIC attachments to find public IP
        const vnicPath = `/20160918/vnicAttachments?compartmentId=${encodeURIComponent(tenancyOcid)}&instanceId=${instanceId}`;
        const { data: vnicData } = await ociRequest('GET', vnicPath, region, {
          tenancyOcid, userOcid, fingerprint, privateKey
        });

        let publicIp: string | null = null;
        const vnicAttachments = vnicData as { vnicId: string; lifecycleState: string }[];
        
        if (vnicAttachments?.length && vnicAttachments[0].lifecycleState === 'ATTACHED') {
          // Get VNIC details for public IP
          const vnicDetailsPath = `/20160918/vnics/${vnicAttachments[0].vnicId}`;
          const { data: vnicDetails } = await ociRequest('GET', vnicDetailsPath, region, {
            tenancyOcid, userOcid, fingerprint, privateKey
          });
          publicIp = (vnicDetails as { publicIp?: string })?.publicIp || null;
        }

        // Update status in database
        if (instance.lifecycleState === 'RUNNING' && publicIp) {
          await supabase.from('cloud_config')
            .update({ status: 'running' })
            .eq('provider', 'oracle');
            
          await supabase.from('vps_config').upsert({
            provider: 'oracle',
            region,
            outbound_ip: publicIp,
            status: 'running',
            instance_type: 'VM.Standard.A1.Flex'
          }, { onConflict: 'provider' });
        }

        return new Response(
          JSON.stringify({ 
            success: true,
            instanceId: instance.id,
            displayName: instance.displayName,
            status: instance.lifecycleState,
            publicIp,
            timeCreated: instance.timeCreated
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'terminate-instance': {
        const { tenancyOcid, userOcid, fingerprint, privateKey, instanceId, region = 'ap-tokyo-1' } = params;
        
        if (!instanceId) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing instanceId' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const path = `/20160918/instances/${instanceId}`;
        const { status } = await ociRequest('DELETE', path, region, {
          tenancyOcid, userOcid, fingerprint, privateKey
        });

        if (status !== 204 && status !== 200) {
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to terminate instance' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update database
        await supabase.from('cloud_config')
          .update({ status: 'stopped', is_active: false })
          .eq('provider', 'oracle');

        await supabase.from('vps_timeline_events').insert({
          provider: 'oracle',
          event_type: 'termination',
          title: 'Instance terminated',
          description: `Instance ${instanceId} terminated`,
          metadata: { instanceId, region }
        });

        return new Response(
          JSON.stringify({ success: true, message: 'Instance terminated' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Unknown action' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[oracle-cloud] Error:', message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
