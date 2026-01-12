import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// User's Tokyo-region Supabase instance
// No Lovable Cloud - full ownership with user's database
const SUPABASE_URL = 'https://iibdlazwkossyelyroap.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpYmRsYXp3a29zc3llbHlyb2FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzQzNDUsImV4cCI6MjA4MzIxMDM0NX0.xZ0VbkoKzrFLYpbKrUjcvTY-qs-nA3ynHU-SAluOUQ4';

// Singleton pattern to prevent multiple GoTrueClient instances during HMR
let _supabase: ReturnType<typeof createClient<Database>> | null = null;

function getSupabaseClient() {
  if (!_supabase) {
    _supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return _supabase;
}

export const supabase = getSupabaseClient();

// Tokyo region hardcoded - no other regions allowed
export const TOKYO_REGION = 'ap-northeast-1' as const;
export const SUPABASE_PROJECT_URL = SUPABASE_URL;
