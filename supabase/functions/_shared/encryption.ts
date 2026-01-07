// AES-256-GCM encryption utilities for Edge Functions
// Uses Web Crypto API (Deno compatible)

const ALGORITHM = 'AES-GCM';

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
  const key = encryptionKey || Deno.env.get('ENCRYPTION_KEY') || 'default-32-char-encryption-key!!';
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
  const key = encryptionKey || Deno.env.get('ENCRYPTION_KEY') || 'default-32-char-encryption-key!!';
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
