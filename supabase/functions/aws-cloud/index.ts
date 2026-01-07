import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AWS Signature V4 implementation for REST API calls
async function createAwsSignature(
  method: string,
  service: string,
  region: string,
  path: string,
  queryParams: Record<string, string>,
  headers: Record<string, string>,
  body: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<Record<string, string>> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  
  // Create canonical request
  const canonicalUri = path;
  const canonicalQuerystring = Object.keys(queryParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');
  
  const signedHeaders = Object.keys(headers)
    .map(k => k.toLowerCase())
    .sort()
    .join(';');
  
  const canonicalHeaders = Object.keys(headers)
    .map(k => `${k.toLowerCase()}:${headers[k].trim()}`)
    .sort()
    .join('\n') + '\n';
  
  const encoder = new TextEncoder();
  const payloadHash = await crypto.subtle.digest('SHA-256', encoder.encode(body));
  const payloadHashHex = Array.from(new Uint8Array(payloadHash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHashHex
  ].join('\n');
  
  const canonicalRequestHash = await crypto.subtle.digest('SHA-256', encoder.encode(canonicalRequest));
  const canonicalRequestHashHex = Array.from(new Uint8Array(canonicalRequestHash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // Create string to sign
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    canonicalRequestHashHex
  ].join('\n');
  
  // Create signing key
  const getSignatureKey = async (key: string, dateStamp: string, region: string, service: string) => {
    const kDate = await hmacSha256(`AWS4${key}`, dateStamp);
    const kRegion = await hmacSha256Bytes(kDate, region);
    const kService = await hmacSha256Bytes(kRegion, service);
    const kSigning = await hmacSha256Bytes(kService, 'aws4_request');
    return kSigning;
  };
  
  const hmacSha256 = async (key: string, data: string) => {
    const keyData = encoder.encode(key);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    return await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  };
  
  const hmacSha256Bytes = async (key: ArrayBuffer, data: string) => {
    const cryptoKey = await crypto.subtle.importKey(
      'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    return await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  };
  
  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signatureBytes = await hmacSha256Bytes(signingKey, stringToSign);
  const signature = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  return {
    ...headers,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHashHex,
    'Authorization': authorizationHeader
  };
}

// Make AWS API request
async function awsRequest(
  service: string,
  region: string,
  action: string,
  params: Record<string, string>,
  accessKeyId: string,
  secretAccessKey: string
): Promise<Response> {
  const host = `${service}.${region}.amazonaws.com`;
  const endpoint = `https://${host}`;
  
  const queryParams: Record<string, string> = {
    Action: action,
    Version: service === 'sts' ? '2011-06-15' : '2016-11-15',
    ...params
  };
  
  const headers: Record<string, string> = {
    'Host': host,
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  
  const signedHeaders = await createAwsSignature(
    'POST', service, region, '/', {}, headers, '', accessKeyId, secretAccessKey
  );
  
  const queryString = Object.keys(queryParams)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');
  
  return await fetch(`${endpoint}/?${queryString}`, {
    method: 'POST',
    headers: signedHeaders
  });
}

// Parse AWS XML response
function parseXmlValue(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { action, credentials, sshPublicKey, specs, instanceId } = await req.json();
    const region = specs?.region || 'ap-northeast-1'; // Tokyo

    console.log(`[AWS Cloud] Action: ${action}, Region: ${region}`);

    switch (action) {
      case 'validate-credentials': {
        const { accessKeyId, secretAccessKey } = credentials || {};
        
        if (!accessKeyId || !secretAccessKey) {
          return new Response(
            JSON.stringify({ valid: false, error: 'Missing credentials' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        try {
          // Use STS GetCallerIdentity to validate credentials
          const response = await awsRequest(
            'sts', 'us-east-1', 'GetCallerIdentity', {},
            accessKeyId, secretAccessKey
          );
          
          const xmlResponse = await response.text();
          console.log('[AWS Cloud] STS Response:', xmlResponse.substring(0, 500));
          
          if (!response.ok) {
            const errorCode = parseXmlValue(xmlResponse, 'Code');
            return new Response(
              JSON.stringify({ valid: false, error: errorCode || 'Invalid credentials' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          const accountId = parseXmlValue(xmlResponse, 'Account');
          const arn = parseXmlValue(xmlResponse, 'Arn');
          const userId = parseXmlValue(xmlResponse, 'UserId');
          
          console.log(`[AWS Cloud] Validated - Account: ${accountId}, ARN: ${arn}`);

          return new Response(
            JSON.stringify({ 
              valid: true, 
              account: accountId,
              arn: arn,
              userId: userId
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          console.error('[AWS Cloud] Validation error:', error);
          return new Response(
            JSON.stringify({ valid: false, error: error instanceof Error ? error.message : 'Validation failed' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'deploy-instance': {
        const { accessKeyId, secretAccessKey } = credentials || {};
        const instanceType = specs?.instanceType || 't4g.micro';
        // Ubuntu 24.04 LTS ARM64 AMI for Tokyo region
        const imageId = specs?.imageId || 'ami-0d52744d6551d851e';

        console.log(`[AWS Cloud] Deploying ${instanceType} in ${region} with AMI ${imageId}`);

        try {
          // Step 1: Create or use existing key pair
          const keyName = `hft-bot-key-${Date.now()}`;
          
          if (sshPublicKey) {
            const importKeyResponse = await awsRequest(
              'ec2', region, 'ImportKeyPair',
              {
                KeyName: keyName,
                PublicKeyMaterial: btoa(sshPublicKey)
              },
              accessKeyId, secretAccessKey
            );
            console.log('[AWS Cloud] Key pair imported');
          }

          // Step 2: Create security group
          const sgName = `hft-bot-sg-${Date.now()}`;
          const createSgResponse = await awsRequest(
            'ec2', region, 'CreateSecurityGroup',
            {
              GroupName: sgName,
              Description: 'HFT Bot Security Group - SSH and Trading Ports'
            },
            accessKeyId, secretAccessKey
          );
          
          const sgXml = await createSgResponse.text();
          const securityGroupId = parseXmlValue(sgXml, 'groupId');
          console.log('[AWS Cloud] Security group created:', securityGroupId);

          // Step 3: Add security group rules
          if (securityGroupId) {
            // Allow SSH (22)
            await awsRequest('ec2', region, 'AuthorizeSecurityGroupIngress', {
              GroupId: securityGroupId,
              IpProtocol: 'tcp',
              FromPort: '22',
              ToPort: '22',
              CidrIp: '0.0.0.0/0'
            }, accessKeyId, secretAccessKey);

            // Allow HTTP (8080) for health checks
            await awsRequest('ec2', region, 'AuthorizeSecurityGroupIngress', {
              GroupId: securityGroupId,
              IpProtocol: 'tcp',
              FromPort: '8080',
              ToPort: '8080',
              CidrIp: '0.0.0.0/0'
            }, accessKeyId, secretAccessKey);

            // Allow HTTPS (443)
            await awsRequest('ec2', region, 'AuthorizeSecurityGroupIngress', {
              GroupId: securityGroupId,
              IpProtocol: 'tcp',
              FromPort: '443',
              ToPort: '443',
              CidrIp: '0.0.0.0/0'
            }, accessKeyId, secretAccessKey);

            console.log('[AWS Cloud] Security group rules added');
          }

          // Step 4: Run instance
          const runParams: Record<string, string> = {
            ImageId: imageId,
            InstanceType: instanceType,
            MinCount: '1',
            MaxCount: '1',
            'TagSpecification.1.ResourceType': 'instance',
            'TagSpecification.1.Tag.1.Key': 'Name',
            'TagSpecification.1.Tag.1.Value': 'HFT-Bot-Tokyo'
          };
          
          if (securityGroupId) {
            runParams['SecurityGroupId.1'] = securityGroupId;
          }
          if (sshPublicKey) {
            runParams['KeyName'] = keyName;
          }

          const runResponse = await awsRequest(
            'ec2', region, 'RunInstances', runParams,
            accessKeyId, secretAccessKey
          );
          
          const runXml = await runResponse.text();
          console.log('[AWS Cloud] RunInstances response:', runXml.substring(0, 1000));
          
          if (!runResponse.ok) {
            const errorCode = parseXmlValue(runXml, 'Code');
            const errorMessage = parseXmlValue(runXml, 'Message');
            throw new Error(`${errorCode}: ${errorMessage}`);
          }

          const newInstanceId = parseXmlValue(runXml, 'instanceId');
          console.log('[AWS Cloud] Instance created:', newInstanceId);

          // Step 5: Wait for instance and get public IP
          let publicIp: string | null = null;
          let attempts = 0;
          const maxAttempts = 30;

          while (!publicIp && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
            attempts++;
            
            const describeResponse = await awsRequest(
              'ec2', region, 'DescribeInstances',
              { 'InstanceId.1': newInstanceId! },
              accessKeyId, secretAccessKey
            );
            
            const describeXml = await describeResponse.text();
            publicIp = parseXmlValue(describeXml, 'publicIpAddress');
            const state = parseXmlValue(describeXml, 'name');
            
            console.log(`[AWS Cloud] Instance state: ${state}, IP: ${publicIp}`);
            
            if (state === 'running' && publicIp) break;
          }

          // Update database
          await supabase.from('cloud_config').upsert({
            provider: 'aws',
            region: region,
            instance_type: instanceType,
            status: 'running',
            is_active: true,
            updated_at: new Date().toISOString()
          }, { onConflict: 'provider' });

          await supabase.from('vps_config').upsert({
            provider: 'aws',
            region: region,
            instance_type: instanceType,
            status: 'running',
            outbound_ip: publicIp,
            updated_at: new Date().toISOString()
          }, { onConflict: 'provider' });

          await supabase.from('failover_config').upsert({
            provider: 'aws',
            region: region,
            is_enabled: true,
            priority: 2,
            health_check_url: publicIp ? `http://${publicIp}:8080/health` : null,
            updated_at: new Date().toISOString()
          }, { onConflict: 'provider' });

          // Log timeline event
          await supabase.from('vps_timeline_events').insert({
            provider: 'aws',
            event_type: 'deployment',
            event_subtype: 'instance_created',
            title: 'AWS EC2 Instance Deployed',
            description: `${instanceType} in ${region} - ${publicIp || 'IP pending'}`,
            metadata: { instanceId: newInstanceId, instanceType, region, imageId }
          });

          // Send Telegram notification
          try {
            await supabase.functions.invoke('telegram-bot', {
              body: {
                action: 'send-message',
                message: `🚀 <b>AWS VPS DEPLOYED</b>\n\n` +
                  `✅ Instance: ${newInstanceId}\n` +
                  `📍 Region: ${region} (Tokyo)\n` +
                  `💻 Type: ${instanceType}\n` +
                  `🌐 IP: ${publicIp || 'Pending...'}\n` +
                  `💰 Cost: ~$8.35/mo (Free tier eligible)`
              }
            });
          } catch (e) {
            console.log('[AWS Cloud] Telegram notification skipped');
          }

          return new Response(
            JSON.stringify({ 
              success: true, 
              instanceId: newInstanceId,
              publicIp: publicIp,
              region,
              instanceType,
              securityGroupId
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );

        } catch (error) {
          console.error('[AWS Cloud] Deploy error:', error);
          
          // Log failure event
          await supabase.from('vps_timeline_events').insert({
            provider: 'aws',
            event_type: 'deployment',
            event_subtype: 'failed',
            title: 'AWS Deployment Failed',
            description: error instanceof Error ? error.message : 'Unknown error',
            metadata: { instanceType, region, error: String(error) }
          });

          return new Response(
            JSON.stringify({ 
              error: error instanceof Error ? error.message : 'Deployment failed'
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'get-instance-status': {
        const { accessKeyId, secretAccessKey } = credentials || {};
        
        try {
          const describeResponse = await awsRequest(
            'ec2', region, 'DescribeInstances',
            instanceId ? { 'InstanceId.1': instanceId } : {},
            accessKeyId, secretAccessKey
          );
          
          const describeXml = await describeResponse.text();
          const state = parseXmlValue(describeXml, 'name');
          const publicIp = parseXmlValue(describeXml, 'publicIpAddress');
          const launchTime = parseXmlValue(describeXml, 'launchTime');
          
          return new Response(
            JSON.stringify({ 
              status: state,
              publicIp,
              launchTime,
              instanceId
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to get status' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'stop-instance': {
        const { accessKeyId, secretAccessKey } = credentials || {};
        
        try {
          const stopResponse = await awsRequest(
            'ec2', region, 'StopInstances',
            { 'InstanceId.1': instanceId },
            accessKeyId, secretAccessKey
          );
          
          const stopXml = await stopResponse.text();
          const previousState = parseXmlValue(stopXml, 'previousState');
          const currentState = parseXmlValue(stopXml, 'currentState');
          
          // Update database
          await supabase.from('vps_config')
            .update({ status: 'stopped', updated_at: new Date().toISOString() })
            .eq('provider', 'aws');

          // Log timeline event
          await supabase.from('vps_timeline_events').insert({
            provider: 'aws',
            event_type: 'lifecycle',
            event_subtype: 'stopped',
            title: 'AWS Instance Stopped',
            description: `Instance ${instanceId} stopped`,
            metadata: { instanceId, previousState, currentState }
          });

          return new Response(
            JSON.stringify({ 
              success: true,
              previousState,
              currentState
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to stop instance' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'start-instance': {
        const { accessKeyId, secretAccessKey } = credentials || {};
        
        try {
          const startResponse = await awsRequest(
            'ec2', region, 'StartInstances',
            { 'InstanceId.1': instanceId },
            accessKeyId, secretAccessKey
          );
          
          const startXml = await startResponse.text();
          const previousState = parseXmlValue(startXml, 'previousState');
          const currentState = parseXmlValue(startXml, 'currentState');
          
          // Update database
          await supabase.from('vps_config')
            .update({ status: 'running', updated_at: new Date().toISOString() })
            .eq('provider', 'aws');

          // Log timeline event
          await supabase.from('vps_timeline_events').insert({
            provider: 'aws',
            event_type: 'lifecycle',
            event_subtype: 'started',
            title: 'AWS Instance Started',
            description: `Instance ${instanceId} started`,
            metadata: { instanceId, previousState, currentState }
          });

          return new Response(
            JSON.stringify({ 
              success: true,
              previousState,
              currentState
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to start instance' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'terminate-instance': {
        const { accessKeyId, secretAccessKey } = credentials || {};
        
        try {
          const terminateResponse = await awsRequest(
            'ec2', region, 'TerminateInstances',
            { 'InstanceId.1': instanceId },
            accessKeyId, secretAccessKey
          );
          
          const terminateXml = await terminateResponse.text();
          const previousState = parseXmlValue(terminateXml, 'previousState');
          const currentState = parseXmlValue(terminateXml, 'currentState');
          
          // Update database
          await supabase.from('vps_config')
            .update({ status: 'terminated', updated_at: new Date().toISOString() })
            .eq('provider', 'aws');

          await supabase.from('cloud_config')
            .update({ status: 'terminated', is_active: false, updated_at: new Date().toISOString() })
            .eq('provider', 'aws');

          // Log timeline event
          await supabase.from('vps_timeline_events').insert({
            provider: 'aws',
            event_type: 'lifecycle',
            event_subtype: 'terminated',
            title: 'AWS Instance Terminated',
            description: `Instance ${instanceId} terminated`,
            metadata: { instanceId, previousState, currentState }
          });

          return new Response(
            JSON.stringify({ 
              success: true,
              previousState,
              currentState
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to terminate instance' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[AWS Cloud] Function error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
