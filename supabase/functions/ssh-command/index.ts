import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SSHCommandRequest {
  instanceId?: string;
  ipAddress?: string;
  command: string;
  privateKey?: string;
  username?: string;
  timeout?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: SSHCommandRequest = await req.json();
    const { command, timeout = 60000 } = body;
    let { ipAddress, privateKey, username = 'root' } = body;

    console.log(`SSH command request for ${ipAddress || body.instanceId}: ${command.substring(0, 50)}...`);

    // If instanceId provided, fetch IP and private key from database
    if (body.instanceId && (!ipAddress || !privateKey)) {
      const { data: instance, error: instanceError } = await supabase
        .from('vps_instances')
        .select('ip_address, ssh_private_key')
        .eq('id', body.instanceId)
        .single();

      if (instanceError || !instance) {
        throw new Error(`Instance not found: ${body.instanceId}`);
      }

      ipAddress = ipAddress || instance.ip_address;
      privateKey = privateKey || instance.ssh_private_key;
    }

    if (!ipAddress) {
      throw new Error('IP address is required');
    }

    if (!privateKey) {
      throw new Error('SSH private key is required');
    }

    if (!command) {
      throw new Error('Command is required');
    }

    // Basic command validation - allow most commands since we control them
    // Only block the most dangerous rm -rf / style commands
    if (/rm\s+-rf\s+\/\s*$/.test(command) || /rm\s+-rf\s+\/\s*;/.test(command)) {
      throw new Error('Command blocked: destructive rm operation');
    }

    // Write private key to temp file (chmod not available in edge functions)
    const keyFileName = `/tmp/ssh_key_${crypto.randomUUID()}`;
    await Deno.writeTextFile(keyFileName, privateKey);

    try {
      // Build SSH command
      const sshArgs = [
        '-i', keyFileName,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-o', 'ConnectTimeout=10',
        '-o', 'BatchMode=yes',
        `${username}@${ipAddress}`,
        command,
      ];

      console.log(`Executing SSH command to ${username}@${ipAddress}`);

      // Execute SSH command with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const process = new Deno.Command('ssh', {
        args: sshArgs,
        stdout: 'piped',
        stderr: 'piped',
        signal: controller.signal,
      });

      const { code, stdout, stderr } = await process.output();
      clearTimeout(timeoutId);

      const output = new TextDecoder().decode(stdout);
      const errorOutput = new TextDecoder().decode(stderr);

      console.log(`SSH command completed with exit code ${code}`);

      return new Response(
        JSON.stringify({
          success: code === 0,
          exitCode: code,
          output: output,
          error: code !== 0 ? errorOutput : undefined,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } finally {
      // Clean up temp key file
      try {
        await Deno.remove(keyFileName);
      } catch {
        console.warn('Failed to clean up temp key file');
      }
    }

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('SSH command error:', error.message);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        exitCode: -1,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
