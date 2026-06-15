#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const ref = process.env.SUPABASE_PROJECT_REF || 'sqsxmvbqabftbmuyutlu';
const directSupabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const directServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function management(path) {
  let token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    try {
      token = readFileSync(`${homedir()}/.supabase/access-token`, 'utf8').trim();
    } catch {
      throw new Error('Missing Supabase credentials. Set SUPABASE_SERVICE_ROLE_KEY + SUPABASE_URL, or SUPABASE_ACCESS_TOKEN.');
    }
  }
  const res = await fetch(`https://api.supabase.com${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Management API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getServiceRoleKey() {
  if (directServiceRoleKey) return directServiceRoleKey;
  const keys = await management(`/v1/projects/${ref}/api-keys`);
  const serviceRoleKey = keys.find((key) => key.name === 'service_role')?.api_key;
  if (!serviceRoleKey) throw new Error('Could not find Supabase service_role key');
  return serviceRoleKey;
}

function getSupabaseUrl() {
  return directSupabaseUrl || `https://${ref}.supabase.co`;
}

async function rest(serviceRoleKey, table) {
  const res = await fetch(`${getSupabaseUrl()}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase REST ${table} ${res.status}: ${await res.text()}`);
  return res.json();
}

const serviceRoleKey = await getServiceRoleKey();

const snapshot = {
  createdAt: new Date().toISOString(),
  projectRef: ref,
  tables: {
    podkash_store: await rest(serviceRoleKey, 'podkash_store'),
    podkash_google_tokens: await rest(serviceRoleKey, 'podkash_google_tokens'),
  },
};

mkdirSync('backups', { recursive: true });
const file = `backups/podkash-snapshot-${snapshot.createdAt.replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify(snapshot, null, 2));
console.log(file);
