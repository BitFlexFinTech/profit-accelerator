import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AWS SDK would be used in production, this is a simplified version
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, credentials, sshPublicKey, specs } = await req.json();

    switch (action) {
      case 'validate-credentials': {
        // In production, this would use AWS STS GetCallerIdentity
        // For now, we validate the format
        const { accessKeyId, secretAccessKey } = credentials || {};
        
        const isValid = 
          accessKeyId?.length >= 16 && 
          secretAccessKey?.length >= 32;

        if (isValid) {
          // Simulate AWS API call
          return new Response(
            JSON.stringify({ 
              valid: true, 
              account: '123456789012',
              arn: `arn:aws:iam::123456789012:user/hft-bot`
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          return new Response(
            JSON.stringify({ valid: false }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'deploy-instance': {
        // In production, this would use AWS EC2 SDK
        // Steps:
        // 1. Create key pair or import SSH key
        // 2. Create security group with SSH + required ports
        // 3. RunInstances with t4g.micro, Ubuntu ARM64 AMI
        // 4. Wait for running state
        // 5. Get public IP

        const region = specs?.region || 'ap-northeast-1';
        const instanceType = specs?.instanceType || 't4g.micro';

        // Simulate capacity check (random failure for demo)
        const hasCapacity = Math.random() > 0.2; // 80% success rate

        if (!hasCapacity) {
          return new Response(
            JSON.stringify({ 
              error: 'InsufficientInstanceCapacity',
              message: 'There is no Spot capacity available that matches your request.'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Simulate successful deployment
        const instanceId = `i-${crypto.randomUUID().slice(0, 17)}`;
        const publicIp = `13.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;

        return new Response(
          JSON.stringify({ 
            success: true, 
            instanceId,
            publicIp,
            region,
            instanceType,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-instance-status': {
        const { instanceId } = await req.json();
        
        // Simulate instance status
        return new Response(
          JSON.stringify({ 
            status: 'running',
            state: { code: 16, name: 'running' },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'stop-instance': {
        const { instanceId } = await req.json();
        
        return new Response(
          JSON.stringify({ 
            success: true,
            previousState: 'running',
            currentState: 'stopping',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'start-instance': {
        const { instanceId } = await req.json();
        
        return new Response(
          JSON.stringify({ 
            success: true,
            previousState: 'stopped',
            currentState: 'pending',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'terminate-instance': {
        const { instanceId } = await req.json();
        
        return new Response(
          JSON.stringify({ 
            success: true,
            previousState: 'running',
            currentState: 'shutting-down',
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
  } catch (error) {
    console.error('AWS cloud function error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});