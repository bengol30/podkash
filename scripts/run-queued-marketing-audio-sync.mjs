#!/usr/bin/env node
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { runMarketingAudioSync } from '../lib/marketing-audio-sync.ts';

const projectRef = process.env.SUPABASE_PROJECT_REF || 'sqsxmvbqabftbmuyutlu';
const supabaseUrl = process.env.SUPABASE_URL || `https://${projectRef}.supabase.co`;

async function getServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = readFileSync(`${homedir()}/.supabase/access-token`, 'utf8').trim();
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Supabase management API ${res.status}: ${await res.text()}`);
  const keys = await res.json();
  const serviceRoleKey = keys.find(key => key.name === 'service_role')?.api_key;
  if (!serviceRoleKey) throw new Error('Missing Supabase service_role key');
  return serviceRoleKey;
}

async function loadLocalSecrets() {
  for (const file of ['.env.local', '.env.production.local']) {
    let text = '';
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    for (const line of text.split(/\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
  process.env.SUPABASE_URL ||= supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= await getServiceRoleKey();
}

async function getStore() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/podkash_store?id=eq.default&select=data`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Supabase REST ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows[0]?.data;
}

const lockFile = path.join(tmpdir(), 'podkash-marketing-audio-sync-worker.lock');
if (existsSync(lockFile)) {
  const pid = Number(readFileSync(lockFile, 'utf8'));
  if (Number.isFinite(pid)) {
    try {
      process.kill(pid, 0);
      console.log(`Marketing audio sync worker already running (pid ${pid}).`);
      process.exit(0);
    } catch {
      rmSync(lockFile, { force: true });
    }
  }
}
writeFileSync(lockFile, String(process.pid));
process.on('exit', () => rmSync(lockFile, { force: true }));

await loadLocalSecrets();
const explicitJobId = process.argv[2];
const store = await getStore();
const jobs = store?.marketingAudioSyncJobs || [];
const job = explicitJobId ? jobs.find(item => item.id === explicitJobId) : jobs.find(item => item.status === 'queued');
if (!job) {
  console.log('No queued marketing audio sync jobs.');
  process.exit(0);
}
console.log(`Running marketing audio sync job ${job.id} (${job.episodeTitle})`);
await runMarketingAudioSync(job.id);
console.log(`Finished marketing audio sync job ${job.id}`);
