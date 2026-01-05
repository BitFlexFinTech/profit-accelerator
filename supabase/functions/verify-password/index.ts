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
    const { password, action } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[verify-password] Action: ${action}`);

    if (action === 'set') {
      // Set master password (first time setup)
      const passwordHash = await hashPassword(password);
      
      // Check if password already exists
      const { data: existing } = await supabase
        .from('master_password')
        .select('id')
        .limit(1);

      if (existing && existing.length > 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Master password already set' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabase
        .from('master_password')
        .insert({
          password_hash: passwordHash,
        });

      if (error) {
        console.error('[verify-password] Insert error:', error);
        throw error;
      }

      console.log('[verify-password] Master password set successfully');
      return new Response(
        JSON.stringify({ success: true, message: 'Master password set' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'verify') {
      // Verify master password
      const { data, error } = await supabase
        .from('master_password')
        .select('password_hash')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[verify-password] Select error:', error);
        throw error;
      }

      if (!data) {
        console.log('[verify-password] No password set, needs setup');
        return new Response(
          JSON.stringify({ success: false, needsSetup: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const isValid = await verifyPassword(password, data.password_hash);
      console.log(`[verify-password] Password verification: ${isValid ? 'success' : 'failed'}`);

      return new Response(
        JSON.stringify({ success: isValid }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'check') {
      // Just check if password exists
      const { data, error } = await supabase
        .from('master_password')
        .select('id')
        .limit(1);

      if (error) {
        console.error('[verify-password] Check error:', error);
        throw error;
      }

      const hasPassword = data && data.length > 0;
      console.log(`[verify-password] Password exists: ${hasPassword}`);

      return new Response(
        JSON.stringify({ hasPassword }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[verify-password] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'tokyo-hft-salt-v2');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}
