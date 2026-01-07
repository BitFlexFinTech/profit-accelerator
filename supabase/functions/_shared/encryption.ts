// AES-256-GCM encryption utilities for Edge Functions
// Uses Web Crypto API (Deno compatible)

import { createClient } from "npm:@supabase/supabase-js@2";

const ALGORITHM = 'AES-GCM';

// Cache for the encryption key to avoid repeated DB calls
let cachedKey: string | null = null;
let cacheExpiry: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Get encryption key from database or environment
async function getEncryptionKey(): Promise<string> {
  // First try environment variable (backward compatible)
  const envKey = Deno.env.get('ENCRYPTION_KEY');
  if (envKey && envKey !== 'default-32-char-encryption-key!!') {
    return envKey;
  }

  // Check cache
  if (cachedKey && Date.now() < cacheExpiry) {
    return cachedKey;
  }

  // Fetch from system_secrets table
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data, error } = await supabase
    .from('system_secrets')
    .select('secret_value')
    .eq('secret_name', 'encryption_key')
    .single();

  if (error) {
    console.warn('[encryption] Failed to fetch key from DB:', error.message);
  }

  if (data?.secret_value) {
    // Update last accessed timestamp (fire and forget)
    (async () => {
      try {
        await supabase
          .from('system_secrets')
          .update({ last_accessed_at: new Date().toISOString() })
          .eq('secret_name', 'encryption_key');
      } catch { /* ignore */ }
    })();

    // Cache the key
    cachedKey = data.secret_value;
    cacheExpiry = Date.now() + CACHE_TTL;
    
    return data.secret_value;
  }

  // Fallback to default (will trigger warning in logs)
  console.warn('[encryption] No encryption key found - using default (INSECURE)');
  return 'default-32-char-encryption-key!!';
}

// Derive a 256-bit key from the encryption key using PBKDF2
async function deriveKey(encryptionKey: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(encryptionKey),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes.buffer;
}

export async function encrypt(text: string, encryptionKey?: string): Promise<string> {
  const key = encryptionKey || await getEncryptionKey();
  const encoder = new TextEncoder();
  
  // Generate random IV and salt
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96 bits for GCM
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // Derive key
  const cryptoKey = await deriveKey(key, salt.buffer);
  
  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv.buffer },
    cryptoKey,
    encoder.encode(text)
  );

  // Return as JSON with hex-encoded values
  return JSON.stringify({
    iv: toHex(iv.buffer),
    salt: toHex(salt.buffer),
    encryptedData: toHex(encrypted),
  });
}

export async function decrypt(encryptedData: string, encryptionKey?: string): Promise<string> {
  const key = encryptionKey || await getEncryptionKey();
  const decoder = new TextDecoder();
  
  const data = JSON.parse(encryptedData);
  const iv = fromHex(data.iv);
  const salt = fromHex(data.salt);
  const ciphertext = fromHex(data.encryptedData);
  
  // Derive key
  const cryptoKey = await deriveKey(key, salt);
  
  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    cryptoKey,
    ciphertext
  );

  return decoder.decode(decrypted);
}

export async function encryptCredentials(credentials: Record<string, unknown>): Promise<string> {
  return encrypt(JSON.stringify(credentials));
}

export async function decryptCredentials(encryptedCreds: string): Promise<Record<string, unknown>> {
  const decrypted = await decrypt(encryptedCreds);
  return JSON.parse(decrypted);
}

export async function encryptPrivateKey(privateKey: string): Promise<string> {
  return encrypt(privateKey);
}

export async function decryptPrivateKey(encryptedKey: string): Promise<string> {
  return decrypt(encryptedKey);
}
