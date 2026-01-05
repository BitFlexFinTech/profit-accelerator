import { createClient } from '@supabase/supabase-js';

// User's Tokyo-region Supabase instance
// No Lovable Cloud - full ownership with user's database
const SUPABASE_URL = 'https://iibdlazwkossyelyroap.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_fDm-yCO6xX7-ipOcYJvJLg_mBZYyzX7';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Tokyo region hardcoded - no other regions allowed
export const TOKYO_REGION = 'ap-northeast-1' as const;
export const SUPABASE_PROJECT_URL = SUPABASE_URL;
