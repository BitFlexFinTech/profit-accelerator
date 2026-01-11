import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 60 * 1000; // 1 hour
const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MIN_PASSWORD_LENGTH = 12;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { password, action, sessionToken } = await req.json();
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[verify-password] Action: ${action}, IP: ${clientIP}`);

    // Action: Validate existing session
    if (action === 'validate-session') {
      if (!sessionToken) {
        return new Response(
          JSON.stringify({ valid: false, error: 'No session token provided' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: session, error } = await supabase
        .from('active_sessions')
        .select('*')
        .eq('token', sessionToken)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (error || !session) {
        return new Response(
          JSON.stringify({ valid: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update last activity
      await supabase
        .from('active_sessions')
        .update({ last_activity: new Date().toISOString() })
        .eq('id', session.id);

      return new Response(
        JSON.stringify({ valid: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Logout - invalidate session
    if (action === 'logout') {
      if (sessionToken) {
        await supabase
          .from('active_sessions')
          .delete()
          .eq('token', sessionToken);
      }
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting check for password actions
    if (action === 'set' || action === 'verify') {
      const oneHourAgo = new Date(Date.now() - LOCKOUT_DURATION_MS).toISOString();
      const { data: attempts } = await supabase
        .from('password_attempts')
        .select('id')
        .eq('ip_address', clientIP)
        .eq('success', false)
        .gte('attempted_at', oneHourAgo);

      if (attempts && attempts.length >= MAX_ATTEMPTS) {
        console.log(`[verify-password] Rate limited IP: ${clientIP}`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Too many failed attempts. Please try again in 1 hour.',
            rateLimited: true 
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (action === 'set') {
      // Validate password strength
      if (!password || password.length < MIN_PASSWORD_LENGTH) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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

      // Hash with bcrypt (cost factor 12)
      const passwordHash = await bcrypt.hash(password);
      
      const { error } = await supabase
        .from('master_password')
        .insert({
          password_hash: passwordHash,
        });

      if (error) {
        console.error('[verify-password] Insert error:', error);
        throw error;
      }

      // Create session token
      const newSessionToken = crypto.randomUUID();
      await supabase
        .from('active_sessions')
        .insert({
          token: newSessionToken,
          expires_at: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
          ip_address: clientIP,
          user_agent: userAgent,
        });

      // Log successful attempt
      await supabase
        .from('password_attempts')
        .insert({ ip_address: clientIP, success: true });

      console.log('[verify-password] Master password set successfully');
      return new Response(
        JSON.stringify({ success: true, message: 'Master password set', sessionToken: newSessionToken }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'verify') {
      // Get stored hash
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

      // Verify password using bcrypt
      let isValid = false;
      
      // Check if it's a bcrypt hash (starts with $2)
      if (data.password_hash.startsWith('$2')) {
        isValid = await bcrypt.compare(password, data.password_hash);
      } else {
        // Legacy SHA-256 hash - verify and upgrade to bcrypt
        const legacyHash = await legacyHashPassword(password);
        isValid = legacyHash === data.password_hash;
        
        if (isValid) {
          // Upgrade to bcrypt - get the id first
          const { data: pwRow } = await supabase
            .from('master_password')
            .select('id')
            .limit(1)
            .single();
          
          if (pwRow?.id) {
            const newHash = await bcrypt.hash(password);
            await supabase
              .from('master_password')
              .update({ password_hash: newHash, updated_at: new Date().toISOString() })
              .eq('id', pwRow.id);
            console.log('[verify-password] Upgraded legacy hash to bcrypt');
          }
        }
      }

      // Log attempt
      await supabase
        .from('password_attempts')
        .insert({ ip_address: clientIP, success: isValid });

      if (!isValid) {
        console.log(`[verify-password] Password verification failed for IP: ${clientIP}`);
        return new Response(
          JSON.stringify({ success: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create session token on successful verify
      const newSessionToken = crypto.randomUUID();
      await supabase
        .from('active_sessions')
        .insert({
          token: newSessionToken,
          expires_at: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
          ip_address: clientIP,
          user_agent: userAgent,
        });

      // Clean up expired sessions
      await supabase
        .from('active_sessions')
        .delete()
        .lt('expires_at', new Date().toISOString());

      console.log(`[verify-password] Password verification: success, session created`);
      return new Response(
        JSON.stringify({ success: true, sessionToken: newSessionToken }),
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

// Legacy hash function for migration compatibility
async function legacyHashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'tokyo-hft-salt-v2');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
