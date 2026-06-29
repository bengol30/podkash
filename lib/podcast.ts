import { readGoogleDriveTokens, readStore, writeStore } from './db';
import { refreshGoogleDriveTokensIfNeeded, syncGoogleDriveEpisodes } from './google-drive-sync';
import { type PodcastEpisode, type PodcastPublishStatus } from './store-types';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import * as tus from 'tus-js-client';

const execFileAsync = promisify(execFile);

const PODCAST_AUDIO_BITRATE = process.env.PODCAST_AUDIO_BITRATE || '96k';
const PODCAST_AUDIO_THRESHOLD_MB = Number(process.env.PODCAST_AUDIO_TRANSCODE_THRESHOLD_MB || 40);
const PODCAST_AUDIO_THRESHOLD_BYTES = Number.isFinite(PODCAST_AUDIO_THRESHOLD_MB) && PODCAST_AUDIO_THRESHOLD_MB > 0
  ? PODCAST_AUDIO_THRESHOLD_MB * 1024 * 1024
  : 40 * 1024 * 1024;

export type PodcastSupabaseStatus = {
  configured: boolean;
  bucket: string;
  publicBaseUrl: string;
  storageReady?: boolean;
  message?: string;
};

const defaultShow = {
  title: process.env.PODCAST_SHOW_TITLE || 'פודקש - הפודקאסט של צעירי קרית שמונה',
  description: process.env.PODCAST_SHOW_DESCRIPTION || 'הפודקאסט של צעירי קרית שמונה',
  language: process.env.PODCAST_SHOW_LANGUAGE || 'he',
  author: process.env.PODCAST_SHOW_AUTHOR || 'פודקש',
  ownerName: process.env.PODCAST_OWNER_NAME || process.env.PODCAST_SHOW_AUTHOR || 'פודקש',
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
  const audio = await preparePodcastAudio(await file.arrayBuffer(), file.name, file.type || 'audio/mpeg', file.size);
  return uploadPodcastAudioBytes(audio.bytes, audio.fileName, audio.mimeType, audio.size, episodeId);
}

function isMp3Audio(fileName: string, mimeType: string) {
  const ext = extname(fileName).toLowerCase();
  const mime = mimeType.toLowerCase();
  return ext === '.mp3' || mime === 'audio/mpeg' || mime === 'audio/mp3';
}

function podcastMp3Name(fileName: string) {
  const ext = extname(fileName);
  const base = basename(fileName, ext).replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || 'episode';
  return `${base}-podcast.mp3`;
}

async function preparePodcastAudio(bytes: ArrayBuffer, fileName: string, mimeType: string, size: number) {
  const disabled = process.env.PODCAST_AUDIO_TRANSCODE === 'false';
  if (disabled || (isMp3Audio(fileName, mimeType) && size <= PODCAST_AUDIO_THRESHOLD_BYTES)) {
    return { bytes, fileName, mimeType: mimeType || 'audio/mpeg', size };
  }

  const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
  const dir = await mkdtemp(join(tmpdir(), 'podkash-podcast-audio-'));
  const inputExt = extname(fileName) || '.audio';
  const inputPath = join(dir, `source${inputExt}`);
  const outputPath = join(dir, 'podcast.mp3');

  try {
    await writeFile(inputPath, Buffer.from(bytes));
    await execFileAsync(ffmpegPath, [
      '-y',
      '-i', inputPath,
      '-vn',
      '-ac', '1',
      '-ar', '44100',
      '-codec:a', 'libmp3lame',
      '-b:a', PODCAST_AUDIO_BITRATE,
      '-compression_level', '2',
      outputPath,
    ], { maxBuffer: 10 * 1024 * 1024 });
    const [outBytes, outStat] = await Promise.all([readFile(outputPath), stat(outputPath)]);
    return {
      bytes: outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength),
      fileName: podcastMp3Name(fileName),
      mimeType: 'audio/mpeg',
      size: outStat.size,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`כיווץ האודיו ל־MP3 נכשל: ${message}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function uploadPodcastAudioBytes(bytes: ArrayBuffer, fileName: string, mimeType: string, size: number, episodeId?: string) {
  const cfg = supabaseConfig();
  if (!cfg.url || !cfg.key) throw new Error('Supabase לא מוגדר עדיין');
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'episode.mp3';
  const path = `${new Date().toISOString().slice(0,10)}/${episodeId || crypto.randomUUID()}-${safeName}`;
  const publicResult = {
    audioUrl: `${cfg.url}/storage/v1/object/public/${cfg.bucket}/${path}`,
    audioStoragePath: path,
    audioFileName: fileName,
    audioBytes: size,
    audioMimeType: mimeType || 'audio/mpeg',
  };
  if (size > 5 * 1024 * 1024) {
    await uploadPodcastAudioBytesTus(cfg, bytes, path, mimeType || 'audio/mpeg');
    return publicResult;
  }
  const res = await fetch(`${cfg.url}/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${path}`, {
    method: 'POST',
    headers: {
      apikey: cfg.key,
      authorization: `Bearer ${cfg.key}`,
      'content-type': mimeType || 'audio/mpeg',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`העלאה ל־Supabase נכשלה (${res.status}): ${await res.text()}`);
  return publicResult;
}

function uploadPodcastAudioBytesTus(cfg: ReturnType<typeof supabaseConfig>, bytes: ArrayBuffer, path: string, mimeType: string) {
  const projectRef = cfg.url.match(/^https:\/\/([^.]+)\.supabase\.co$/)?.[1];
  const endpoint = projectRef ? `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable` : `${cfg.url}/storage/v1/upload/resumable`;
  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(Buffer.from(bytes), {
      endpoint,
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: {
        authorization: `Bearer ${cfg.key}`,
        apikey: cfg.key,
        'x-upsert': 'true',
      },
      metadata: {
        bucketName: cfg.bucket,
        objectName: path,
        contentType: mimeType || 'audio/mpeg',
        cacheControl: '3600',
      },
      onError: reject,
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}

export async function importPodcastAudioFromDrive(sourceEpisodeId: number, podcastEpisodeId?: string) {
  if (!Number.isFinite(sourceEpisodeId)) throw new Error('חסר פרק מקור לייבוא אודיו מ־Drive');
  await syncGoogleDriveEpisodes({ episodeId: sourceEpisodeId });
  const store = await readStore();
  const episode = store.episodes.find(ep => ep.id === sourceEpisodeId);
  if (!episode) throw new Error('פרק המקור לא נמצא במערכת');
  const file = episode.driveAssetStatus?.fullAudio?.files?.[0];
  if (!file?.id) throw new Error('לא נמצא קובץ אודיו רשמי בתיקיית “קובץ שמע מלא” של הפרק. העלה לשם MP3/WAV ואז נסה שוב.');
  const rawTokens = await readGoogleDriveTokens();
  if (!rawTokens) throw new Error('Google Drive לא מחובר');
  const { tokens } = await refreshGoogleDriveTokensIfNeeded(rawTokens);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`, {
    headers: { authorization: `Bearer ${tokens.accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`הורדת האודיו מ־Drive נכשלה (${res.status}): ${await res.text()}`);
  const bytes = await res.arrayBuffer();
  const mimeType = res.headers.get('content-type') || file.mimeType || 'audio/mpeg';
  const fileName = file.name || `${episode.title}.mp3`;
  const audio = await preparePodcastAudio(bytes, fileName, mimeType, bytes.byteLength);
  return { sourceFileName: fileName, sourceFileUrl: file.url, ...(await uploadPodcastAudioBytes(audio.bytes, audio.fileName, audio.mimeType, audio.size, podcastEpisodeId || `episode-${sourceEpisodeId}`)) };
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
