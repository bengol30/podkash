import crypto from 'crypto';
import postgres from 'postgres';
import { type Store, type Booking, seedStore } from './store-types';

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

// Generic key/value access on the podkash_store table (no shape coercion).
export async function readRaw(id: string): Promise<unknown | null> {
  if (!databaseUrl && canUseSupabaseRest()) {
    const rows = await supabaseRest<Array<{ data: unknown }>>(`podkash_store?id=eq.${encodeURIComponent(id)}&select=data&limit=1`);
    return rows[0]?.data ?? null;
  }
  await ensureStoreTable();
  const db = sql();
  const rows = await db<{ data: unknown }[]>`select data from podkash_store where id = ${id} limit 1`;
  return rows[0]?.data ?? null;
}

export async function writeRaw(id: string, data: unknown): Promise<void> {
  if (!databaseUrl && canUseSupabaseRest()) {
    await supabaseRest('podkash_store', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id, data, updated_at: new Date().toISOString() }),
    });
    return;
  }
  await ensureStoreTable();
  const db = sql();
  await db`
    insert into podkash_store (id, data, updated_at)
    values (${id}, ${db.json(data as Parameters<typeof db.json>[0])}, now())
    on conflict (id) do update set data = excluded.data, updated_at = now()
  `;
}

export async function readStore(id = 'default'): Promise<Store> {
  return coerceStoreData(await readRaw(id));
}

export async function writeStore(data: Store, id = 'default'): Promise<Store> {
  const store = coerceStoreData(data);
  await writeRaw(id, store);
  return store;
}

// ---- Users (admin + hosts), stored as a dedicated podkash_store row ----
export const blankStore: Store = { episodes: [], people: [], tasks: [], messages: [], platforms: [], sessions: [], applications: [] };

export type StoredUser = {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'host';
  hostId: string;
  passwordHash: string;
  createdAt: string;
  driveFolderId?: string;
  driveFolderUrl?: string;
};
export type PublicUser = Omit<StoredUser, 'passwordHash'>;

const USERS_ID = 'podkash_users';

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

async function getUsersRaw(): Promise<StoredUser[]> {
  const raw = await readRaw(USERS_ID) as { users?: StoredUser[] } | null;
  return Array.isArray(raw?.users) ? raw!.users : [];
}

async function saveUsersRaw(users: StoredUser[]) {
  await writeRaw(USERS_ID, { users });
}

export async function getUserByUsername(username: string): Promise<StoredUser | null> {
  const wanted = username.trim().toLowerCase();
  const users = await getUsersRaw();
  return users.find(u => u.username.toLowerCase() === wanted) || null;
}

export async function listHosts(): Promise<PublicUser[]> {
  const users = await getUsersRaw();
  return users.filter(u => u.role === 'host').map(({ passwordHash, ...rest }) => rest);
}

export async function createHost(input: { name: string; username: string; password: string }): Promise<PublicUser> {
  const name = input.name.trim();
  const username = input.username.trim();
  if (!name || !username || !input.password) throw new Error('חסר שם, שם משתמש או סיסמה');
  if (!/^[a-zA-Z0-9._-]{3,}$/.test(username)) throw new Error('שם המשתמש חייב להיות 3 תווים ומעלה (אותיות/ספרות/._-)');
  if (username.toLowerCase() === 'admin') throw new Error('שם המשתמש "admin" שמור למנהל');
  const users = await getUsersRaw();
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) throw new Error('שם המשתמש כבר תפוס');
  const id = `h_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  const user: StoredUser = { id, name, username, role: 'host', hostId: id, passwordHash: hashPassword(input.password), createdAt: new Date().toISOString() };
  await saveUsersRaw([...users, user]);
  // Seed a blank, isolated store for the new host.
  await writeRaw(`host:${id}`, blankStore);
  const { passwordHash, ...pub } = user;
  return pub;
}

export async function deleteHost(id: string): Promise<void> {
  const users = await getUsersRaw();
  await saveUsersRaw(users.filter(u => u.id !== id));
  // Note: the host's data row (host:<id>) is intentionally kept, not deleted.
}

export async function getHost(hostId: string): Promise<PublicUser | null> {
  const users = await getUsersRaw();
  const user = users.find(u => u.hostId === hostId);
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

export async function setHostDriveFolder(hostId: string, folderId: string, folderUrl: string): Promise<void> {
  const users = await getUsersRaw();
  await saveUsersRaw(users.map(u => u.hostId === hostId ? { ...u, driveFolderId: folderId, driveFolderUrl: folderUrl } : u));
}

// ---- Shared studio bookings (one global pool) ----
export async function getBookings(): Promise<Booking[]> {
  const raw = await readRaw('bookings') as { bookings?: Booking[] } | null;
  return Array.isArray(raw?.bookings) ? raw!.bookings : [];
}

export async function saveBookings(bookings: Booking[]): Promise<void> {
  await writeRaw('bookings', { bookings });
}

export async function bookingsRowExists(): Promise<boolean> {
  return (await readRaw('bookings')) != null;
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

export async function readGoogleDriveConnection(): Promise<GoogleDriveConnection | null> {
  if (!databaseUrl && canUseSupabaseRest()) {
    const rows = await supabaseRest<GoogleDriveConnection[]>('podkash_google_tokens?id=eq.drive&select=email,name,picture,scope,connectedAt:created_at,expiresAt:expires_at&limit=1');
    return rows[0] || null;
  }
  await ensureGoogleTokensTable();
  const db = sql();
  const rows = await db<GoogleDriveConnection[]>`
    select email, name, picture, scope, created_at::text as "connectedAt", expires_at::text as "expiresAt"
    from podkash_google_tokens where id = 'drive' limit 1
  `;
  return rows[0] || null;
}

export async function readGoogleDriveTokens(): Promise<GoogleDriveTokens | null> {
  if (!databaseUrl && canUseSupabaseRest()) {
    const rows = await supabaseRest<Array<GoogleDriveConnection & { accessToken: string; refreshToken?: string; tokenType?: string }>>('podkash_google_tokens?id=eq.drive&select=accessToken:access_token,refreshToken:refresh_token,tokenType:token_type,scope,expiresAt:expires_at,email,name,picture,connectedAt:created_at&limit=1');
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
    from podkash_google_tokens where id = 'drive' limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    accessToken: decryptText(row.accessToken),
    refreshToken: row.refreshToken ? decryptText(row.refreshToken) : undefined,
  };
}

export async function writeGoogleDriveTokens(tokens: GoogleDriveTokens) {
  const encryptedAccess = encryptText(tokens.accessToken);
  const encryptedRefresh = tokens.refreshToken ? encryptText(tokens.refreshToken) : null;
  if (!databaseUrl && canUseSupabaseRest()) {
    await supabaseRest('podkash_google_tokens', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: 'drive',
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
    values ('drive', ${encryptedAccess}, ${encryptedRefresh}, ${tokens.tokenType || 'Bearer'}, ${tokens.scope || null}, ${tokens.expiresAt || null}, ${tokens.email || null}, ${tokens.name || null}, ${tokens.picture || null}, now())
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

export async function deleteGoogleDriveTokens() {
  if (!databaseUrl && canUseSupabaseRest()) {
    await supabaseRest('podkash_google_tokens?id=eq.drive', { method: 'DELETE' });
    return;
  }
  await ensureGoogleTokensTable();
  const db = sql();
  await db`delete from podkash_google_tokens where id = 'drive'`;
}
