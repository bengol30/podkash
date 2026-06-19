import { googleConfig } from './google-auth';
import { readGoogleDriveTokens, readStore, writeGoogleDriveTokens, writeStore, type GoogleDriveTokens } from './db';
import { type Episode, type Store } from './store-types';

const ROOT_FOLDER_NAME = 'Podkash Episodes';
const SUBFOLDERS = {
  marketing: '01 - סרטוני שיווק',
  fullVideo: '02 - הפרק המצולם המלא',
  fullAudio: '03 - קובץ שמע מלא',
} as const;

type DriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  webViewLink?: string;
  trashed?: boolean;
};

type DriveTokens = GoogleDriveTokens & { accessToken: string };

function escapeQueryValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function episodeFolderName(episode: Episode) {
  const number = episode.number ? `#${episode.number}` : `פרק ${episode.id}`;
  return `${number} - ${episode.title}`.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

async function refreshIfNeeded(tokens: GoogleDriveTokens): Promise<{ tokens: DriveTokens; refreshed: boolean }> {
  let accessToken = tokens.accessToken;
  const expiresAt = tokens.expiresAt ? new Date(tokens.expiresAt).getTime() : 0;
  if (!expiresAt || expiresAt > Date.now() + 60_000) return { tokens: { ...tokens, accessToken }, refreshed: false };
  if (!tokens.refreshToken) throw new Error('Google Drive token expired and no refresh token is stored');

  const { clientId, clientSecret } = googleConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || 'Google token refresh failed');

  accessToken = json.access_token;
  const nextTokens = {
    ...tokens,
    accessToken,
    tokenType: json.token_type || tokens.tokenType || 'Bearer',
    expiresAt: new Date(Date.now() + Number(json.expires_in || 3600) * 1000).toISOString(),
  };
  await writeGoogleDriveTokens(nextTokens);
  return { tokens: nextTokens, refreshed: true };
}

async function drive<T>(tokens: DriveTokens, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${tokens.accessToken}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message || json?.error_description || json?.error || `Drive API failed (${res.status})`;
    throw new Error(message);
  }
  return json as T;
}

async function findFolder(tokens: DriveTokens, name: string, parentId?: string) {
  const parentQuery = parentId ? ` and '${escapeQueryValue(parentId)}' in parents` : ` and 'root' in parents`;
  const q = `name = '${escapeQueryValue(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentQuery}`;
  const result = await drive<{ files: DriveFile[] }>(tokens, `/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink)&pageSize=1`);
  return result.files?.[0] || null;
}

// Make a folder public: anyone with the link can view AND upload/edit (so the whole
// team and guests can use it without permission friction). Best-effort — never breaks sync.
async function makeFolderPublic(tokens: DriveTokens, fileId: string) {
  try {
    await drive(tokens, `/files/${fileId}/permissions?fields=id`, {
      method: 'POST',
      body: JSON.stringify({ role: 'writer', type: 'anyone' }),
    });
  } catch (error) {
    console.error('Podkash Drive: could not make folder public', fileId, error);
  }
}

async function ensureFolder(tokens: DriveTokens, name: string, parentId?: string) {
  const existing = await findFolder(tokens, name, parentId);
  if (existing) {
    await makeFolderPublic(tokens, existing.id);
    return { ...existing, created: false };
  }
  const created = await drive<DriveFile>(tokens, '/files?fields=id,name,mimeType,webViewLink', {
    method: 'POST',
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  await makeFolderPublic(tokens, created.id);
  return { ...created, created: true };
}

async function listFolderFiles(tokens: DriveTokens, folderId: string) {
  const q = `'${escapeQueryValue(folderId)}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
  const result = await drive<{ files: DriveFile[] }>(tokens, `/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink)&pageSize=20&orderBy=modifiedTime desc`);
  return result.files || [];
}

function folderStatus(files: DriveFile[]) {
  return {
    fileCount: files.length,
    hasFiles: files.length > 0,
    files: files.slice(0, 10).map(file => ({ id: file.id, name: file.name, mimeType: file.mimeType, url: file.webViewLink })),
    checkedAt: new Date().toISOString(),
  };
}

function updateEpisodeAssets(episode: Episode, data: {
  episodeFolder: DriveFile;
  marketingFolder: DriveFile;
  fullVideoFolder: DriveFile;
  fullAudioFolder: DriveFile;
  marketingFiles: DriveFile[];
  fullVideoFiles: DriveFile[];
  fullAudioFiles: DriveFile[];
}) {
  const missing: string[] = [];
  if (!data.marketingFiles.length) missing.push('אין עדיין קבצים בתיקיית סרטוני שיווק');
  if (!data.fullVideoFiles.length) missing.push('אין עדיין קבצים בתיקיית הפרק המצולם המלא');
  if (!data.fullAudioFiles.length) missing.push('אין עדיין קבצים בתיקיית קובץ השמע המלא');

  return {
    ...episode,
    driveFolderUrl: data.episodeFolder.webViewLink || episode.driveFolderUrl,
    shortsDriveFolderUrl: data.marketingFolder.webViewLink || episode.shortsDriveFolderUrl,
    fullVideoUrl: data.fullVideoFolder.webViewLink || episode.fullVideoUrl,
    fullVideoFolderUrl: data.fullVideoFolder.webViewLink,
    fullAudioFolderUrl: data.fullAudioFolder.webViewLink,
    driveMarketingFolderUrl: data.marketingFolder.webViewLink,
    driveAssetsSyncedAt: new Date().toISOString(),
    driveAssetStatus: {
      marketing: folderStatus(data.marketingFiles),
      fullVideo: folderStatus(data.fullVideoFiles),
      fullAudio: folderStatus(data.fullAudioFiles),
    },
    assetsNote: missing.length ? missing.join(' · ') : 'כל תיקיות Drive קיימות ויש בהן קבצים.',
  } satisfies Episode;
}

export async function syncGoogleDriveEpisodes(options?: { episodeId?: number }) {
  const rawTokens = await readGoogleDriveTokens();
  if (!rawTokens) throw new Error('Google Drive is not connected');
  const { tokens, refreshed } = await refreshIfNeeded(rawTokens);
  const store = await readStore();
  const root = await ensureFolder(tokens, ROOT_FOLDER_NAME);
  const episodes = options?.episodeId ? store.episodes.filter(ep => ep.id === options.episodeId) : store.episodes;
  const summaries: Array<{
    episodeId: number;
    title: string;
    episodeFolderUrl?: string;
    created: string[];
    fileCounts: { marketing: number; fullVideo: number; fullAudio: number };
  }> = [];

  const nextEpisodes = await Promise.all(store.episodes.map(async episode => {
    if (options?.episodeId && episode.id !== options.episodeId) return episode;
    const created: string[] = [];
    const episodeFolder = await ensureFolder(tokens, episodeFolderName(episode), root.id);
    if (episodeFolder.created) created.push('episode');
    const marketingFolder = await ensureFolder(tokens, SUBFOLDERS.marketing, episodeFolder.id);
    if (marketingFolder.created) created.push('marketing');
    const fullVideoFolder = await ensureFolder(tokens, SUBFOLDERS.fullVideo, episodeFolder.id);
    if (fullVideoFolder.created) created.push('fullVideo');
    const fullAudioFolder = await ensureFolder(tokens, SUBFOLDERS.fullAudio, episodeFolder.id);
    if (fullAudioFolder.created) created.push('fullAudio');

    const [marketingFiles, fullVideoFiles, fullAudioFiles] = await Promise.all([
      listFolderFiles(tokens, marketingFolder.id),
      listFolderFiles(tokens, fullVideoFolder.id),
      listFolderFiles(tokens, fullAudioFolder.id),
    ]);

    summaries.push({
      episodeId: episode.id,
      title: episode.title,
      episodeFolderUrl: episodeFolder.webViewLink,
      created,
      fileCounts: { marketing: marketingFiles.length, fullVideo: fullVideoFiles.length, fullAudio: fullAudioFiles.length },
    });

    return updateEpisodeAssets(episode, { episodeFolder, marketingFolder, fullVideoFolder, fullAudioFolder, marketingFiles, fullVideoFiles, fullAudioFiles });
  }));

  const nextStore: Store = { ...store, episodes: nextEpisodes };
  await writeStore(nextStore);

  return {
    ok: true,
    rootFolder: { id: root.id, name: root.name, url: root.webViewLink, created: root.created },
    tokenRefreshed: refreshed,
    syncedEpisodes: episodes.length,
    summaries: summaries.sort((a, b) => a.episodeId - b.episodeId),
  };
}
