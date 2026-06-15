#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const ref = process.env.SUPABASE_PROJECT_REF || 'sqsxmvbqabftbmuyutlu';
const token = process.env.SUPABASE_ACCESS_TOKEN || readFileSync(`${homedir()}/.supabase/access-token`, 'utf8').trim();

async function management(path) {
  const res = await fetch(`https://api.supabase.com${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Management API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function rest(serviceRoleKey, table) {
  const res = await fetch(`https://${ref}.supabase.co/rest/v1/${table}?select=*`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase REST ${table} ${res.status}: ${await res.text()}`);
  return res.json();
}

const keys = await management(`/v1/projects/${ref}/api-keys`);
const serviceRoleKey = keys.find((key) => key.name === 'service_role')?.api_key;
if (!serviceRoleKey) throw new Error('Could not find Supabase service_role key');

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
