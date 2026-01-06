/**
 * SSH Key Generator Utility
 * Generates RSA 4096-bit key pairs client-side using Web Crypto API
 */

// Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Encode number as big-endian bytes
function encodeLength(length: number): Uint8Array {
  const bytes = new Uint8Array(4);
  bytes[0] = (length >> 24) & 0xff;
  bytes[1] = (length >> 16) & 0xff;
  bytes[2] = (length >> 8) & 0xff;
  bytes[3] = length & 0xff;
  return bytes;
}

// Encode string for SSH format
function encodeSSHString(str: string): Uint8Array {
  const strBytes = new TextEncoder().encode(str);
  const length = encodeLength(strBytes.length);
  const result = new Uint8Array(4 + strBytes.length);
  result.set(length, 0);
  result.set(strBytes, 4);
  return result;
}

// Encode binary data for SSH format (with leading zero if high bit set)
function encodeSSHMPInt(data: Uint8Array): Uint8Array {
  // Remove leading zeros
  let start = 0;
  while (start < data.length && data[start] === 0) {
    start++;
  }
  
  // Add leading zero if high bit is set (to indicate positive number)
  const needsLeadingZero = start < data.length && (data[start] & 0x80) !== 0;
  const trimmedLength = data.length - start;
  const resultLength = needsLeadingZero ? trimmedLength + 1 : trimmedLength;
  
  const length = encodeLength(resultLength);
  const result = new Uint8Array(4 + resultLength);
  result.set(length, 0);
  
  if (needsLeadingZero) {
    result[4] = 0;
    result.set(data.subarray(start), 5);
  } else {
    result.set(data.subarray(start), 4);
  }
  
  return result;
}

// Calculate MD5 fingerprint
async function calculateFingerprint(publicKeyBlob: ArrayBuffer): Promise<string> {
  // Use SHA-256 since MD5 is not available in Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-256', publicKeyBlob);
  const hashArray = new Uint8Array(hashBuffer);
  const fingerprint = Array.from(hashArray.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join(':');
  return fingerprint;
}

// Parse JWK to get RSA components
function parseRSAPublicKey(jwk: JsonWebKey): { e: Uint8Array; n: Uint8Array } {
  const e = new Uint8Array(base64ToArrayBuffer(jwk.e!.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - jwk.e!.length % 4) % 4)));
  const n = new Uint8Array(base64ToArrayBuffer(jwk.n!.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - jwk.n!.length % 4) % 4)));
  return { e, n };
}

// Build OpenSSH format public key
function buildSSHPublicKey(e: Uint8Array, n: Uint8Array): Uint8Array {
  const keyType = encodeSSHString('ssh-rsa');
  const eEncoded = encodeSSHMPInt(e);
  const nEncoded = encodeSSHMPInt(n);
  
  const result = new Uint8Array(keyType.length + eEncoded.length + nEncoded.length);
  let offset = 0;
  result.set(keyType, offset);
  offset += keyType.length;
  result.set(eEncoded, offset);
  offset += eEncoded.length;
  result.set(nEncoded, offset);
  
  return result;
}

export interface SSHKeyPair {
  publicKey: string;      // OpenSSH format (ssh-rsa AAAA... comment)
  privateKey: string;     // PEM format
  fingerprint: string;    // SHA-256 fingerprint (colon-separated)
}

/**
 * Generate an RSA 4096-bit SSH key pair
 * Uses Web Crypto API for client-side generation
 */
export async function generateSSHKeyPair(comment: string = 'hft-trading-bot'): Promise<SSHKeyPair> {
  // Generate RSA key pair
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 4096,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
      hash: 'SHA-256',
    },
    true, // extractable
    ['sign', 'verify']
  );

  // Export public key as JWK to get components
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const { e, n } = parseRSAPublicKey(publicJwk);
  
  // Build SSH format public key
  const sshPublicKeyBlob = buildSSHPublicKey(e, n);
  const sshPublicKeyBase64 = arrayBufferToBase64(sshPublicKeyBlob.buffer as ArrayBuffer);
  const sshPublicKey = `ssh-rsa ${sshPublicKeyBase64} ${comment}`;

  // Export private key as PKCS8 PEM
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const privateKeyBase64 = arrayBufferToBase64(privateKeyBuffer);
  const privateKeyPem = [
    '-----BEGIN PRIVATE KEY-----',
    ...privateKeyBase64.match(/.{1,64}/g) || [],
    '-----END PRIVATE KEY-----'
  ].join('\n');

  // Calculate fingerprint
  const fingerprint = await calculateFingerprint(sshPublicKeyBlob.buffer as ArrayBuffer);

  return {
    publicKey: sshPublicKey,
    privateKey: privateKeyPem,
    fingerprint,
  };
}

/**
 * Download a key file to the user's computer
 */
export function downloadKeyFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
