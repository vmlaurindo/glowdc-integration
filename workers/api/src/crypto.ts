const encoder = new TextEncoder();
const decoder = new TextDecoder();

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function aesKey(encoded: string): Promise<CryptoKey> {
  const raw = decodeBase64(encoded);
  if (raw.byteLength !== 32) throw new Error("encryption_key_must_be_32_bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptText(plaintext: string, encodedKey: string, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(aad) },
    await aesKey(encodedKey),
    encoder.encode(plaintext)
  );
  return `v1.${encodeBase64(iv)}.${encodeBase64(new Uint8Array(cipher))}`;
}

export async function decryptText(envelope: string, encodedKey: string, aad: string): Promise<string> {
  const [version, ivValue, cipherValue] = envelope.split(".");
  if (version !== "v1" || !ivValue || !cipherValue) throw new Error("invalid_cipher_envelope");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(ivValue), additionalData: encoder.encode(aad) },
    await aesKey(encodedKey),
    decodeBase64(cipherValue)
  );
  return decoder.decode(plain);
}

export async function hmacHex(value: string, encodedKey: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase64(encodedKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return hex(new Uint8Array(signature));
}

export async function sha256Hex(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const size = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < size; index += 1) {
    mismatch |= (a[index % Math.max(a.length, 1)] ?? 0) ^ (b[index % Math.max(b.length, 1)] ?? 0);
  }
  return mismatch === 0;
}
