import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VULTR_SERVER_IP = '167.179.83.239';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Check for WebSocket upgrade
  const upgradeHeader = req.headers.get("upgrade") || "";
  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response(JSON.stringify({ 
      error: "Expected WebSocket upgrade",
      usage: "Connect via WebSocket for SSH terminal access",
      serverIp: VULTR_SERVER_IP
    }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  try {
    const { socket, response } = Deno.upgradeWebSocket(req);
    const sshPrivateKey = Deno.env.get('VULTR_SSH_PRIVATE_KEY');
    
    let sshProcess: Deno.ChildProcess | null = null;
    let stdinWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;

    console.log("WebSocket connection opened for SSH terminal");

    socket.onopen = () => {
      console.log("SSH Terminal WebSocket ready");
      socket.send(JSON.stringify({ 
        type: 'connected',
        message: 'WebSocket connection established',
        serverIp: VULTR_SERVER_IP
      }));
    };

    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("Received message:", message.type);

        if (message.type === 'connect') {
          if (!sshPrivateKey) {
            socket.send(JSON.stringify({
              type: 'error',
              message: 'SSH private key not configured. Please add VULTR_SSH_PRIVATE_KEY secret.'
            }));
            return;
          }

          socket.send(JSON.stringify({
            type: 'output',
            data: `\r\n\x1b[33mConnecting to ${VULTR_SERVER_IP}...\x1b[0m\r\n`
          }));

          try {
            // Write private key to temp file
            const keyPath = '/tmp/vultr_ssh_key';
            await Deno.writeTextFile(keyPath, sshPrivateKey);
            await Deno.chmod(keyPath, 0o600);

            // Start SSH process
            const command = new Deno.Command('ssh', {
              args: [
                '-i', keyPath,
                '-o', 'StrictHostKeyChecking=no',
                '-o', 'UserKnownHostsFile=/dev/null',
                '-o', 'LogLevel=ERROR',
                '-tt',
                `root@${VULTR_SERVER_IP}`
              ],
              stdin: 'piped',
              stdout: 'piped',
              stderr: 'piped',
            });

            sshProcess = command.spawn();
            stdinWriter = sshProcess.stdin.getWriter();

            // Stream stdout to WebSocket
            (async () => {
              const reader = sshProcess!.stdout.getReader();
              const decoder = new TextDecoder();
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  const text = decoder.decode(value);
                  socket.send(JSON.stringify({
                    type: 'output',
                    data: text
                  }));
                }
              } catch (e) {
                console.error('stdout error:', e);
              }
            })();

            // Stream stderr to WebSocket
            (async () => {
              const reader = sshProcess!.stderr.getReader();
              const decoder = new TextDecoder();
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  const text = decoder.decode(value);
                  socket.send(JSON.stringify({
                    type: 'output',
                    data: `\x1b[31m${text}\x1b[0m`
                  }));
                }
              } catch (e) {
                console.error('stderr error:', e);
              }
            })();

            // Monitor process exit
            sshProcess.status.then((status) => {
              socket.send(JSON.stringify({
                type: 'disconnected',
                message: `SSH session ended with code ${status.code}`
              }));
              // Clean up key file
              Deno.remove(keyPath).catch(() => {});
            });

            socket.send(JSON.stringify({
              type: 'ssh_connected',
              message: `Connected to ${VULTR_SERVER_IP}`
            }));

          } catch (sshError) {
            console.error('SSH connection error:', sshError);
            socket.send(JSON.stringify({
              type: 'error',
              message: `SSH connection failed: ${sshError instanceof Error ? sshError.message : 'Unknown error'}`
            }));
          }
        } else if (message.type === 'input' && stdinWriter) {
          // Forward input to SSH process
          const encoder = new TextEncoder();
          await stdinWriter.write(encoder.encode(message.data));
        } else if (message.type === 'resize') {
          console.log(`Terminal resized to ${message.cols}x${message.rows}`);
          // Note: PTY resize requires additional handling
        } else if (message.type === 'disconnect') {
          if (stdinWriter) {
            await stdinWriter.close();
          }
          if (sshProcess) {
            sshProcess.kill('SIGTERM');
          }
        }
      } catch (error) {
        console.error("Message handling error:", error);
        socket.send(JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        }));
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    socket.onclose = async () => {
      console.log("WebSocket connection closed");
      if (stdinWriter) {
        try { await stdinWriter.close(); } catch (_) {}
      }
      if (sshProcess) {
        try { sshProcess.kill('SIGTERM'); } catch (_) {}
      }
    };

    return response;
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
