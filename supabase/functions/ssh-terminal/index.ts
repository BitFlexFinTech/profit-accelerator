import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      usage: "Connect via WebSocket for SSH terminal access"
    }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  try {
    const { socket, response } = Deno.upgradeWebSocket(req);

    console.log("WebSocket connection opened");

    socket.onopen = () => {
      console.log("SSH Terminal WebSocket ready");
      socket.send(JSON.stringify({ 
        type: 'connected',
        message: 'WebSocket connection established'
      }));
    };

    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("Received message:", message.type);

        if (message.type === 'connect') {
          // In production, establish actual SSH connection
          // For now, send welcome message
          socket.send(JSON.stringify({
            type: 'output',
            data: '\r\n\x1b[32mConnected to VPS via SSH proxy.\x1b[0m\r\n\r\nroot@hft-bot:~# '
          }));
        } else if (message.type === 'input') {
          const input = message.data;
          
          // Echo input and handle commands
          if (input === '\r') {
            // Process command (in production, forward to SSH)
            socket.send(JSON.stringify({
              type: 'output',
              data: '\r\nroot@hft-bot:~# '
            }));
          } else if (input === '\x7f') {
            // Backspace
            socket.send(JSON.stringify({
              type: 'output',
              data: '\b \b'
            }));
          } else {
            // Echo character
            socket.send(JSON.stringify({
              type: 'output',
              data: input
            }));
          }
        } else if (message.type === 'resize') {
          console.log(`Terminal resized to ${message.cols}x${message.rows}`);
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

    socket.onclose = () => {
      console.log("WebSocket connection closed");
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
