// Edge-safe signed session tokens (Web Crypto only — usable in middleware and route handlers).

export type SessionPayload = {
  uid: string;
  role: 'admin' | 'host';
  hostId: string;
  name: string;
};

function bytesToB64Url(bytes: Uint8Array) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmac(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToB64Url(new Uint8Array(sig));
}

function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const secret = sessionSecret();
  const body = bytesToB64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(body, secret);
  return `${body}.${sig}`;
}

export async function verifySession(token?: string | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const secret = sessionSecret();
  if (!secret) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(body, secret);
  if (sig !== expected) return null;
  try {
    const json = new TextDecoder().decode(b64UrlToBytes(body));
    const payload = JSON.parse(json) as SessionPayload;
    if (!payload || (payload.role !== 'admin' && payload.role !== 'host') || !payload.hostId) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = 'podkash_session';
