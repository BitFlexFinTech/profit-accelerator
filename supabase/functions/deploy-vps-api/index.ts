import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  healthUrl, 
  signalCheckUrl, 
  checkEndpoint,
  VPS_API_TIMEOUT_MS,
  type VpsEndpointResult 
} from "../_shared/vpsControl.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerificationResult {
  success: boolean;
  healthCheck: VpsEndpointResult;
  signalCheck: VpsEndpointResult;
  vpsIp?: string;
  provider?: string;
  manualFixCommands?: string;
}

async function getVPSDetails(supabase: any): Promise<{ ip: string; provider: string } | null> {
  // Try hft_deployments first
  const { data: hftData } = await supabase
    .from('hft_deployments')
    .select('ip_address, provider')
    .in('status', ['active', 'running'])
    .not('ip_address', 'is', null)
    .limit(1)
    .single();

  if (hftData?.ip_address) {
    return { ip: hftData.ip_address, provider: hftData.provider };
  }

  // Try vps_instances
  const { data: vpsData } = await supabase
    .from('vps_instances')
    .select('ip_address, provider')
    .eq('status', 'running')
    .not('ip_address', 'is', null)
    .limit(1)
    .single();

  if (vpsData?.ip_address) {
    return { ip: vpsData.ip_address, provider: vpsData.provider };
  }

  // Try vps_config
  const { data: configData } = await supabase
    .from('vps_config')
    .select('outbound_ip, provider')
    .not('outbound_ip', 'is', null)
    .limit(1)
    .single();

  if (configData?.outbound_ip) {
    return { ip: configData.outbound_ip, provider: configData.provider };
  }

  return null;
}

const MANUAL_FIX_SCRIPT = `# ========================================
# VPS Bot Control API - PERMANENT FIX
# Option A: Nginx Reverse Proxy (Recommended)
# ========================================

# Step 1: Install Nginx
sudo apt-get update && sudo apt-get install -y nginx

# Step 2: Configure Nginx to proxy port 80 -> localhost:3000
sudo tee /etc/nginx/sites-available/bot-api << 'NGINX_CONF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
NGINX_CONF

# Step 3: Enable the site and disable default
sudo ln -sf /etc/nginx/sites-available/bot-api /etc/nginx/sites-enabled/bot-api
sudo rm -f /etc/nginx/sites-enabled/default

# Step 4: Test and reload Nginx
sudo nginx -t && sudo systemctl reload nginx

# Step 5: Ensure firewall allows port 80
sudo ufw allow 80/tcp 2>/dev/null || true

# Step 6: Verify the API is accessible on port 80
curl -sS http://127.0.0.1/health && echo ""
curl -sS http://127.0.0.1/signal-check && echo ""

# ========================================
# Done! The VPS API is now on port 80.
# Re-click "Verify VPS API" in the dashboard.
# ========================================`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get VPS details
    const vpsDetails = await getVPSDetails(supabase);
    
    if (!vpsDetails) {
      const emptyResult: VerificationResult = {
        success: false,
        healthCheck: { ok: false, url: '', timeoutMs: 0, error: 'No VPS configured' },
        signalCheck: { ok: false, url: '', timeoutMs: 0, error: 'No VPS configured' },
      };
      return new Response(JSON.stringify(emptyResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const { ip, provider } = vpsDetails;
    
    // Use shared helpers for URL construction
    const healthEndpoint = healthUrl(ip);
    const signalEndpoint = signalCheckUrl(ip);

    console.log(`[deploy-vps-api] Verifying VPS at ${ip} (${provider})`);
    console.log(`[deploy-vps-api] Health URL: ${healthEndpoint}`);
    console.log(`[deploy-vps-api] Signal URL: ${signalEndpoint}`);

    // Check both endpoints in parallel using shared helper
    const [healthResult, signalResult] = await Promise.all([
      checkEndpoint(healthEndpoint, VPS_API_TIMEOUT_MS),
      checkEndpoint(signalEndpoint, VPS_API_TIMEOUT_MS),
    ]);

    // Validate signal check response has required field
    if (signalResult.ok && signalResult.data) {
      const data = signalResult.data as Record<string, unknown>;
      if (!('signalExists' in data)) {
        signalResult.ok = false;
        signalResult.error = 'Endpoint returns invalid response (missing signalExists)';
      }
    }

    const result: VerificationResult = {
      success: healthResult.ok && signalResult.ok,
      vpsIp: ip,
      provider,
      healthCheck: healthResult,
      signalCheck: signalResult,
    };

    // If not successful, include manual fix commands
    if (!result.success) {
      result.manualFixCommands = MANUAL_FIX_SCRIPT;
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Verification error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      healthCheck: { ok: false, url: '', timeoutMs: 0, error: 'Verification failed' },
      signalCheck: { ok: false, url: '', timeoutMs: 0, error: 'Verification failed' },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
