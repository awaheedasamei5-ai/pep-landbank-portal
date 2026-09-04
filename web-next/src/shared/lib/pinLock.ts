// Port of index.html's PIN quick sign-in (index.html:7129-7150, 17098-
// 17114): an AES-GCM key derived from the PIN via PBKDF2 (150k
// iterations, matching exactly) encrypts the CURRENT session's access/
// refresh tokens, stored only in this browser's localStorage keyed per
// staff member. This is a per-device convenience, not a second
// authentication factor recognized by Supabase itself -- unlocking just
// decrypts and restores a previously-real session via setSession();
// wrong PIN fails at the AES-GCM tag check (decrypt throws), and an
// expired/rotated refresh token fails at setSession() -- both handled by
// the caller falling back to a real password sign-in.

const KEY_PREFIX = 'pep_pinlock_';

interface PinLockRecord {
  salt: string;
  iv: string;
  data: string;
  v: 1;
}

function b64FromBytes(bytes: ArrayBuffer | Uint8Array): string {
  let s = '';
  new Uint8Array(bytes).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

function bytesFromB64(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function deriveKeyFromPin(pin: string, saltB64: string): Promise<CryptoKey> {
  const salt = bytesFromB64(saltB64);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export function pinLockExists(agentKey: string): boolean {
  return !!localStorage.getItem(KEY_PREFIX + agentKey);
}

export function removePinLock(agentKey: string): void {
  localStorage.removeItem(KEY_PREFIX + agentKey);
}

export async function savePinLock(agentKey: string, pin: string, session: { access_token: string; refresh_token: string }): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = b64FromBytes(salt);
  const key = await deriveKeyFromPin(pin, saltB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const payload = enc.encode(JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload);
  const record: PinLockRecord = { salt: saltB64, iv: b64FromBytes(iv), data: b64FromBytes(ciphertext), v: 1 };
  localStorage.setItem(KEY_PREFIX + agentKey, JSON.stringify(record));
}

// Returns null on any failure (no lock saved, wrong PIN, corrupted
// record) -- never throws, so callers can always fall back to password
// without a try/catch of their own.
export async function pinUnlockSession(agentKey: string, pin: string): Promise<{ access_token: string; refresh_token: string } | null> {
  const raw = localStorage.getItem(KEY_PREFIX + agentKey);
  if (!raw) return null;
  let record: PinLockRecord;
  try {
    record = JSON.parse(raw);
  } catch {
    return null;
  }
  try {
    const key = await deriveKeyFromPin(pin, record.salt);
    const iv = bytesFromB64(record.iv);
    const ciphertext = bytesFromB64(record.data);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plainBuf));
  } catch {
    return null;
  }
}
