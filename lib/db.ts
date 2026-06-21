import crypto from 'crypto';
import postgres from 'postgres';
import { type Store, seedStore } from './store-types';

const databaseUrl = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

let client: ReturnType<typeof postgres> | null = null;

function sql() {
  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL or POSTGRES_URL. Connect a Postgres database in Vercel and redeploy.');
  }
  if (!client) {
    client = postgres(databaseUrl, {
      ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1') ? false : 'require',
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return client;
}

function canUseSupabaseRest() {
  return Boolean(supabaseUrl && supabaseServiceRoleKey);
}

async function supabaseRest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!canUseSupabaseRest()) {
    throw new Error('Missing DATABASE_URL/POSTGRES_URL, or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY fallback.');
  }
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabaseServiceRoleKey,
      authorization: `Bearer ${supabaseServiceRoleKey}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Supabase REST ${res.status}: ${await res.text()}`);
  }
  return await res.json() as T;
}

export async function ensureStoreTable() {
  if (!databaseUrl && canUseSupabaseRest()) return;
  const db = sql();
  await db`
    create table if not exists podkash_store (
      id text primary key,
      data jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await db`
    insert into podkash_store (id, data)
    values ('default', ${db.json(seedStore)})
    on conflict (id) do nothing
  `;
}

function coerceStoreData(value: unknown): Store {
  if (!value) return seedStore;
  if (typeof value === 'string') {
    try {
      return coerceStoreData(JSON.parse(value));
    } catch {
      return seedStore;
    }
  }
  const source = value as Partial<Store>;
  return {
    episodes: Array.isArray(source.episodes) ? source.episodes : seedStore.episodes,
    people: Array.isArray(source.people) ? source.people : seedStore.people,
    tasks: Array.isArray(source.tasks) ? source.tasks : seedStore.tasks,
    messages: Array.isArray(source.messages) ? source.messages : seedStore.messages,
    platforms: Array.isArray(source.platforms) ? source.platforms : seedStore.platforms,
    sessions: Array.isArray(source.sessions) ? source.sessions : seedStore.sessions,
    applications: Array.isArray(source.applications) ? source.applications : seedStore.applications,
  };
}

export async function readStore(): Promise<Store> {
  if (!databaseUrl && canUseSupabaseRest()) {
    const rows = await supabaseRest<Array<{ data: unknown }>>('podkash_store?id=eq.default&select=data&limit=1');
    return coerceStoreData(rows[0]?.data);
  }
  await ensureStoreTable();
  const db = sql();
  const rows = await db<{ data: unknown }[]>`select data from podkash_store where id = 'default' limit 1`;
  return coerceStoreData(rows[0]?.data);
}

export async function writeStore(data: Store): Promise<Store> {
  const store = coerceStoreData(data);
  if (!databaseUrl && canUseSupabaseRest()) {
    const rows = await supabaseRest<Array<{ data: unknown }>>('podkash_store', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ id: 'default', data: store, updated_at: new Date().toISOString() }),
    });
    return coerceStoreData(rows[0]?.data);
  }
  await ensureStoreTable();
  const db = sql();
  const rows = await db<{ data: unknown }[]>`
    insert into podkash_store (id, data, updated_at)
    values ('default', ${db.json(store)}, now())
    on conflict (id) do update set data = excluded.data, updated_at = now()
    returning data
  `;
  return coerceStoreData(rows[0].data);
}

function tokenSecret() {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || 'podkash-dev-secret';
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptText(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptText(value: string) {
  const [ivRaw, tagRaw, encryptedRaw] = value.split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) return value;
  const decipher = crypto.createDecipheriv('aes-256-gcm', tokenSecret(), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64')), decipher.final()]).toString('utf8');
}

export type GoogleDriveConnection = {
  email?: string;
  name?: string;
  picture?: string;
  scope?: string;
  connectedAt?: string;
  expiresAt?: string;
};

export type GoogleDriveTokens = GoogleDriveConnection & {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
};

export async function ensureGoogleTokensTable() {
  if (!databaseUrl && canUseSupabaseRest()) return;
  const db = sql();
  await db`
    create table if not exists podkash_google_tokens (
      id text primary key,
      access_token text not null,
      refresh_token text,
      token_type text,
      scope text,
      expires_at timestamptz,
      email text,
      name text,
      picture text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
}

async function readConnection(providerId: string): Promise<GoogleDriveConnection | null> {
  if (!databaseUrl && canUseSupabaseRest()) {
    const rows = await supabaseRest<GoogleDriveConnection[]>(`podkash_google_tokens?id=eq.${providerId}&select=email,name,picture,scope,connectedAt:created_at,expiresAt:expires_at&limit=1`);
    return rows[0] || null;
  }
  await ensureGoogleTokensTable();
  const db = sql();
  const rows = await db<GoogleDriveConnection[]>`
    select email, name, picture, scope, created_at::text as "connectedAt", expires_at::text as "expiresAt"
    from podkash_google_tokens where id = ${providerId} limit 1
  `;
  return rows[0] || null;
}

async function readTokens(providerId: string): Promise<GoogleDriveTokens | null> {
  if (!databaseUrl && canUseSupabaseRest()) {
    const rows = await supabaseRest<Array<GoogleDriveConnection & { accessToken: string; refreshToken?: string; tokenType?: string }>>(`podkash_google_tokens?id=eq.${providerId}&select=accessToken:access_token,refreshToken:refresh_token,tokenType:token_type,scope,expiresAt:expires_at,email,name,picture,connectedAt:created_at&limit=1`);
    const row = rows[0];
    if (!row) return null;
    return {
      ...row,
      accessToken: decryptText(row.accessToken),
      refreshToken: row.refreshToken ? decryptText(row.refreshToken) : undefined,
    };
  }
  await ensureGoogleTokensTable();
  const db = sql();
  const rows = await db<Array<GoogleDriveConnection & { accessToken: string; refreshToken?: string; tokenType?: string }>>`
    select access_token as "accessToken", refresh_token as "refreshToken", token_type as "tokenType", scope, expires_at::text as "expiresAt", email, name, picture, created_at::text as "connectedAt"
    from podkash_google_tokens where id = ${providerId} limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    accessToken: decryptText(row.accessToken),
    refreshToken: row.refreshToken ? decryptText(row.refreshToken) : undefined,
  };
}

async function writeTokens(providerId: string, tokens: GoogleDriveTokens) {
  const encryptedAccess = encryptText(tokens.accessToken);
  const encryptedRefresh = tokens.refreshToken ? encryptText(tokens.refreshToken) : null;
  if (!databaseUrl && canUseSupabaseRest()) {
    await supabaseRest('podkash_google_tokens', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: providerId,
        access_token: encryptedAccess,
        refresh_token: encryptedRefresh,
        token_type: tokens.tokenType || 'Bearer',
        scope: tokens.scope || null,
        expires_at: tokens.expiresAt || null,
        email: tokens.email || null,
        name: tokens.name || null,
        picture: tokens.picture || null,
        updated_at: new Date().toISOString(),
      }),
    });
    return;
  }
  await ensureGoogleTokensTable();
  const db = sql();
  await db`
    insert into podkash_google_tokens (id, access_token, refresh_token, token_type, scope, expires_at, email, name, picture, updated_at)
    values (${providerId}, ${encryptedAccess}, ${encryptedRefresh}, ${tokens.tokenType || 'Bearer'}, ${tokens.scope || null}, ${tokens.expiresAt || null}, ${tokens.email || null}, ${tokens.name || null}, ${tokens.picture || null}, now())
    on conflict (id) do update set
      access_token = excluded.access_token,
      refresh_token = coalesce(excluded.refresh_token, podkash_google_tokens.refresh_token),
      token_type = excluded.token_type,
      scope = excluded.scope,
      expires_at = excluded.expires_at,
      email = excluded.email,
      name = excluded.name,
      picture = excluded.picture,
      updated_at = now()
  `;
}

async function deleteTokens(providerId: string) {
  if (!databaseUrl && canUseSupabaseRest()) {
    await supabaseRest(`podkash_google_tokens?id=eq.${providerId}`, { method: 'DELETE' });
    return;
  }
  await ensureGoogleTokensTable();
  const db = sql();
  await db`delete from podkash_google_tokens where id = ${providerId}`;
}

export const readGoogleDriveConnection = () => readConnection('drive');
export const readGoogleDriveTokens = () => readTokens('drive');
export const writeGoogleDriveTokens = (tokens: GoogleDriveTokens) => writeTokens('drive', tokens);
export const deleteGoogleDriveTokens = () => deleteTokens('drive');

export type YouTubeConnection = GoogleDriveConnection;
export type YouTubeTokens = GoogleDriveTokens;

export const readYouTubeConnection = () => readConnection('youtube');
export const readYouTubeTokens = () => readTokens('youtube');
export const writeYouTubeTokens = (tokens: YouTubeTokens) => writeTokens('youtube', tokens);
export const deleteYouTubeTokens = () => deleteTokens('youtube');
