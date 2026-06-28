import { readStore, writeStore } from './db';
import { type PodcastEpisode, type PodcastPublishStatus } from './store-types';

export type PodcastSupabaseStatus = {
  configured: boolean;
  bucket: string;
  publicBaseUrl: string;
  storageReady?: boolean;
  message?: string;
};

const defaultShow = {
  title: process.env.PODCAST_SHOW_TITLE || 'אין גבולות עם דנה מיוחס',
  description: process.env.PODCAST_SHOW_DESCRIPTION || 'הפודקאסט אין גבולות עם דנה מיוחס',
  language: process.env.PODCAST_SHOW_LANGUAGE || 'he',
  author: process.env.PODCAST_SHOW_AUTHOR || 'דנה מיוחס',
  ownerName: process.env.PODCAST_OWNER_NAME || process.env.PODCAST_SHOW_AUTHOR || 'דנה מיוחס',
  ownerEmail: process.env.PODCAST_OWNER_EMAIL || 'hello@example.com',
  imageUrl: process.env.PODCAST_SHOW_IMAGE_URL || '',
  category: process.env.PODCAST_SHOW_CATEGORY || 'Business',
  explicit: process.env.PODCAST_SHOW_EXPLICIT === 'true' ? 'true' : 'false',
};

export function podcastBaseUrl() {
  return (process.env.PODCAST_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` || 'https://podkash.vercel.app').replace(/\/$/, '');
}

function supabaseConfig() {
  return {
    url: (process.env.PODCAST_SUPABASE_URL || '').trim().replace(/\/$/, ''),
    key: (process.env.PODCAST_SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    bucket: (process.env.PODCAST_SUPABASE_STORAGE_BUCKET || 'podcast-audio').trim(),
  };
}

export async function getPodcastStatus(): Promise<PodcastSupabaseStatus & { show: typeof defaultShow; feedUrl: string; spotifyShowId: string; spotifyShowUrl: string; publishedCount: number; totalCount: number }> {
  const cfg = supabaseConfig();
  const store = await readStore();
  const base = podcastBaseUrl();
  const spotifyShowId = process.env.PODCAST_SPOTIFY_SHOW_ID || '033eNDxQDdcRftOLpRmv29';
  const status: PodcastSupabaseStatus & { show: typeof defaultShow; feedUrl: string; spotifyShowId: string; spotifyShowUrl: string; publishedCount: number; totalCount: number } = {
    configured: Boolean(cfg.url && cfg.key),
    bucket: cfg.bucket,
    publicBaseUrl: base,
    show: defaultShow,
    feedUrl: `${base}/api/podcast/spotify/rss`,
    spotifyShowId,
    spotifyShowUrl: `https://open.spotify.com/show/${spotifyShowId}`,
    publishedCount: store.podcastEpisodes.filter(isPublicEpisode).length,
    totalCount: store.podcastEpisodes.length,
  };
  if (!status.configured) return { ...status, storageReady: false, message: 'חסרים PODCAST_SUPABASE_URL ו־PODCAST_SUPABASE_SERVICE_ROLE_KEY' };
  try {
    const res = await fetch(`${cfg.url}/storage/v1/bucket/${encodeURIComponent(cfg.bucket)}`, {
      headers: { apikey: cfg.key, authorization: `Bearer ${cfg.key}` }, cache: 'no-store'
    });
    return { ...status, storageReady: res.ok, message: res.ok ? 'Supabase Storage מחובר' : `Bucket לא נמצא או אין הרשאה (${res.status})` };
  } catch (error) {
    return { ...status, storageReady: false, message: error instanceof Error ? error.message : 'שגיאה בבדיקת Supabase' };
  }
}

export async function listPodcastEpisodes() {
  const store = await readStore();
  return [...store.podcastEpisodes].sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function normalizeStatus(value: unknown): PodcastPublishStatus {
  return value === 'scheduled' || value === 'published' || value === 'archived' ? value : 'draft';
}

export async function savePodcastEpisode(input: Partial<PodcastEpisode>) {
  const store = await readStore();
  const now = new Date().toISOString();
  const id = input.id || crypto.randomUUID();
  const current = store.podcastEpisodes.find(e => e.id === id);
  const status = normalizeStatus(input.status || current?.status);
  const next: PodcastEpisode = {
    id,
    sourceEpisodeId: Number(input.sourceEpisodeId || current?.sourceEpisodeId) || undefined,
    guid: input.guid || current?.guid || `podkash-${id}`,
    episodeNumber: Number(input.episodeNumber || current?.episodeNumber) || undefined,
    seasonNumber: Number(input.seasonNumber || current?.seasonNumber) || undefined,
    title: String(input.title || current?.title || 'פרק ללא שם').trim(),
    description: String(input.description ?? current?.description ?? '').trim(),
    status,
    audioUrl: String(input.audioUrl || current?.audioUrl || '').trim() || undefined,
    audioStoragePath: input.audioStoragePath || current?.audioStoragePath,
    audioFileName: input.audioFileName || current?.audioFileName,
    audioBytes: Number(input.audioBytes || current?.audioBytes) || undefined,
    audioMimeType: input.audioMimeType || current?.audioMimeType,
    duration: String(input.duration || current?.duration || '').trim() || undefined,
    imageUrl: String(input.imageUrl || current?.imageUrl || '').trim() || undefined,
    explicit: Boolean(input.explicit ?? current?.explicit ?? false),
    scheduledAt: String(input.scheduledAt || current?.scheduledAt || '').trim() || undefined,
    publishedAt: status === 'published' ? String(input.publishedAt || current?.publishedAt || now) : String(input.publishedAt || current?.publishedAt || '').trim() || undefined,
    spotifyUrl: String(input.spotifyUrl || current?.spotifyUrl || '').trim() || undefined,
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };
  const podcastEpisodes = current ? store.podcastEpisodes.map(e => e.id === id ? next : e) : [next, ...store.podcastEpisodes];
  await writeStore({ ...store, podcastEpisodes });
  return next;
}

export async function deletePodcastEpisode(id: string) {
  const store = await readStore();
  await writeStore({ ...store, podcastEpisodes: store.podcastEpisodes.filter(e => e.id !== id) });
}

export async function uploadPodcastAudio(file: File, episodeId?: string) {
  const cfg = supabaseConfig();
  if (!cfg.url || !cfg.key) throw new Error('Supabase לא מוגדר עדיין');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'episode.mp3';
  const path = `${new Date().toISOString().slice(0,10)}/${episodeId || crypto.randomUUID()}-${safeName}`;
  const bytes = await file.arrayBuffer();
  const res = await fetch(`${cfg.url}/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${path}`, {
    method: 'POST',
    headers: {
      apikey: cfg.key,
      authorization: `Bearer ${cfg.key}`,
      'content-type': file.type || 'audio/mpeg',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`העלאה ל־Supabase נכשלה (${res.status}): ${await res.text()}`);
  return {
    audioUrl: `${cfg.url}/storage/v1/object/public/${cfg.bucket}/${path}`,
    audioStoragePath: path,
    audioFileName: file.name,
    audioBytes: file.size,
    audioMimeType: file.type || 'audio/mpeg',
  };
}

export function isPublicEpisode(ep: PodcastEpisode) {
  if (ep.status !== 'published' && ep.status !== 'scheduled') return false;
  if (!ep.audioUrl) return false;
  if (ep.status === 'scheduled') return Boolean(ep.scheduledAt && new Date(ep.scheduledAt).getTime() <= Date.now());
  return true;
}

function x(value: unknown) {
  return String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function pubDate(ep: PodcastEpisode) {
  return new Date(ep.publishedAt || ep.scheduledAt || ep.createdAt).toUTCString();
}

export async function buildPodcastRss() {
  const store = await readStore();
  const base = podcastBaseUrl();
  const feedUrl = `${base}/api/podcast/spotify/rss`;
  const episodes = store.podcastEpisodes.filter(isPublicEpisode).sort((a,b) => new Date(b.publishedAt || b.scheduledAt || b.createdAt).getTime() - new Date(a.publishedAt || a.scheduledAt || a.createdAt).getTime());
  const items = episodes.map(ep => `\n    <item>\n      <title>${x(ep.title)}</title>\n      <description><![CDATA[${ep.description || ''}]]></description>\n      <guid isPermaLink="false">${x(ep.guid)}</guid>\n      <pubDate>${pubDate(ep)}</pubDate>\n      <enclosure url="${x(ep.audioUrl)}" length="${ep.audioBytes || 0}" type="${x(ep.audioMimeType || 'audio/mpeg')}"/>\n      ${ep.duration ? `<itunes:duration>${x(ep.duration)}</itunes:duration>` : ''}\n      ${ep.episodeNumber ? `<itunes:episode>${ep.episodeNumber}</itunes:episode>` : ''}\n      ${ep.seasonNumber ? `<itunes:season>${ep.seasonNumber}</itunes:season>` : ''}\n      <itunes:explicit>${ep.explicit ? 'true' : 'false'}</itunes:explicit>\n      ${ep.imageUrl ? `<itunes:image href="${x(ep.imageUrl)}"/>` : ''}\n    </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>${x(defaultShow.title)}</title>\n    <description>${x(defaultShow.description)}</description>\n    <language>${x(defaultShow.language)}</language>\n    <link>${x(base)}</link>\n    <atom:link href="${x(feedUrl)}" rel="self" type="application/rss+xml"/>\n    <itunes:author>${x(defaultShow.author)}</itunes:author>\n    <itunes:owner><itunes:name>${x(defaultShow.ownerName)}</itunes:name><itunes:email>${x(defaultShow.ownerEmail)}</itunes:email></itunes:owner>\n    <itunes:explicit>${defaultShow.explicit}</itunes:explicit>\n    <itunes:category text="${x(defaultShow.category)}"/>\n    ${defaultShow.imageUrl ? `<itunes:image href="${x(defaultShow.imageUrl)}"/>` : ''}${items}\n  </channel>\n</rss>`;
}
