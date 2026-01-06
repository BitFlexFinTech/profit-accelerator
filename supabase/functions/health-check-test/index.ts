import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HealthResponse {
  status: string;
  timestamp?: number;
  uptime?: number;
  memory?: {
    total: number;
    free: number;
    used: number;
    percent: number;
  };
  cpu?: number[];
  hostname?: string;
  platform?: string;
  version?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const healthUrl = body.url || 'http://167.179.83.239:8080/health';
    const timeout = body.timeout || 10000;

    console.log(`Testing health endpoint: ${healthUrl}`);

    const start = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - start;

      if (!response.ok) {
        console.log(`Health check failed with status: ${response.status}`);
        return new Response(JSON.stringify({
          success: false,
          status: 'error',
          latency,
          error: `HTTP ${response.status}: ${response.statusText}`,
          timestamp: new Date().toISOString(),
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const data: HealthResponse = await response.json();
      console.log(`Health check successful:`, JSON.stringify(data));

      return new Response(JSON.stringify({
        success: true,
        status: data.status || 'ok',
        latency,
        metrics: {
          uptime: data.uptime,
          memory: data.memory,
          cpu: data.cpu,
          hostname: data.hostname,
          platform: data.platform,
          version: data.version,
        },
        timestamp: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (fetchError) {
      const latency = Date.now() - start;
      const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      
      console.error(`Health check failed:`, errorMessage);

      // Determine if it's a timeout or connection error
      const isTimeout = errorMessage.includes('abort') || errorMessage.includes('timeout');
      const isConnectionRefused = errorMessage.includes('refused') || errorMessage.includes('ECONNREFUSED');

      return new Response(JSON.stringify({
        success: false,
        status: 'down',
        latency,
        error: isTimeout 
          ? 'Connection timeout - server may be down or unreachable'
          : isConnectionRefused
          ? 'Connection refused - HFT bot may not be installed or running'
          : errorMessage,
        hint: isConnectionRefused 
          ? 'SSH into the server and run the install script: curl -sSL https://iibdlazwkossyelyroap.supabase.co/functions/v1/install-hft-bot | sudo bash'
          : undefined,
        timestamp: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Health check test error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
