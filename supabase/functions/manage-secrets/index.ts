import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateSecureKey(): string {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
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

    const { action } = await req.json();
    console.log(`[manage-secrets] Action: ${action}`);

    switch (action) {
      case 'init-encryption-key': {
        // Check if key already exists
        const { data: existing } = await supabase
          .from('system_secrets')
          .select('id, version')
          .eq('secret_name', 'encryption_key')
          .single();

        if (existing) {
          console.log('[manage-secrets] Encryption key already initialized');
          return new Response(JSON.stringify({
            success: true,
            message: 'Encryption key already initialized',
            version: existing.version
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Generate secure 32-byte (64 hex chars) key
        const encryptionKey = generateSecureKey();
        console.log('[manage-secrets] Generated new encryption key');

        // Store in database
        const { error: insertError } = await supabase
          .from('system_secrets')
          .insert({
            secret_name: 'encryption_key',
            secret_value: encryptionKey,
            description: 'AES-256-GCM encryption key for SSH keys and credentials',
            version: 1
          });

        if (insertError) {
          console.error('[manage-secrets] Failed to store key:', insertError);
          return new Response(JSON.stringify({
            success: false,
            error: 'Failed to store encryption key'
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
        }

        console.log('[manage-secrets] Encryption key initialized successfully');
        return new Response(JSON.stringify({
          success: true,
          message: 'Encryption key generated and stored',
          version: 1
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get-encryption-status': {
        const { data, error } = await supabase
          .from('system_secrets')
          .select('created_at, updated_at, last_accessed_at, version')
          .eq('secret_name', 'encryption_key')
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('[manage-secrets] Error fetching status:', error);
        }

        return new Response(JSON.stringify({
          success: true,
          initialized: !!data,
          createdAt: data?.created_at || null,
          updatedAt: data?.updated_at || null,
          lastAccessed: data?.last_accessed_at || null,
          version: data?.version || 0
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'rotate-key': {
        // Check if existing key exists
        const { data: existing } = await supabase
          .from('system_secrets')
          .select('id, version')
          .eq('secret_name', 'encryption_key')
          .single();

        if (!existing) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No encryption key to rotate. Initialize first.'
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
        }

        // Generate new key
        const newKey = generateSecureKey();
        const newVersion = (existing.version || 1) + 1;

        // Update the key
        const { error: updateError } = await supabase
          .from('system_secrets')
          .update({
            secret_value: newKey,
            version: newVersion,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        if (updateError) {
          console.error('[manage-secrets] Failed to rotate key:', updateError);
          return new Response(JSON.stringify({
            success: false,
            error: 'Failed to rotate encryption key'
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
        }

        console.log(`[manage-secrets] Key rotated to version ${newVersion}`);
        return new Response(JSON.stringify({
          success: true,
          message: 'Encryption key rotated successfully',
          version: newVersion
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      default:
        return new Response(JSON.stringify({
          success: false,
          error: 'Unknown action'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }
  } catch (error) {
    console.error('[manage-secrets] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
