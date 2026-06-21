import { youtubeConfig } from './google-auth';
import { readYouTubeTokens, writeYouTubeTokens, type YouTubeTokens } from './db';

export type YouTubePrivacy = 'private' | 'unlisted' | 'public';

export type YouTubeUploadMetadata = {
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus: YouTubePrivacy;
  publishAt?: string; // RFC3339 — when set, privacyStatus is forced to 'private'
  madeForKids?: boolean;
};

export type YouTubeChannel = {
  id: string;
  title: string;
  thumbnail?: string;
  customUrl?: string;
  subscriberCount?: string;
  videoCount?: string;
  viewCount?: string;
  uploadsPlaylistId?: string;
};

export type YouTubeVideoSummary = {
  id: string;
  title: string;
  publishedAt?: string;
  thumbnail?: string;
  privacyStatus?: string;
  url: string;
};

type ValidTokens = YouTubeTokens & { accessToken: string };

async function refreshIfNeeded(tokens: YouTubeTokens): Promise<{ tokens: ValidTokens; refreshed: boolean }> {
  const expiresAt = tokens.expiresAt ? new Date(tokens.expiresAt).getTime() : 0;
  if (expiresAt && expiresAt > Date.now() + 60_000) return { tokens: { ...tokens }, refreshed: false };
  if (!tokens.refreshToken) {
    // No refresh token but the access token might still be valid for a while.
    if (!expiresAt) return { tokens: { ...tokens }, refreshed: false };
    throw new Error('YouTube token expired and no refresh token is stored. Reconnect the channel.');
  }

  const { clientId, clientSecret } = youtubeConfig();
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
  if (!res.ok) throw new Error(json.error_description || json.error || 'YouTube token refresh failed');

  const nextTokens: ValidTokens = {
    ...tokens,
    accessToken: json.access_token,
    tokenType: json.token_type || tokens.tokenType || 'Bearer',
    expiresAt: new Date(Date.now() + Number(json.expires_in || 3600) * 1000).toISOString(),
  };
  await writeYouTubeTokens(nextTokens);
  return { tokens: nextTokens, refreshed: true };
}

/** Returns a fresh access token, refreshing and persisting if it expired. */
export async function getValidYouTubeAccess(): Promise<ValidTokens> {
  const raw = await readYouTubeTokens();
  if (!raw) throw new Error('YouTube is not connected');
  const { tokens } = await refreshIfNeeded(raw);
  return tokens;
}

export async function fetchYouTubeChannel(accessToken: string): Promise<YouTubeChannel | null> {
  const url = 'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true';
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message || `YouTube channels.list failed (${res.status})`;
    throw new Error(message);
  }
  const item = json.items?.[0];
  if (!item) return null;
  return {
    id: item.id,
    title: item.snippet?.title || 'YouTube',
    thumbnail: item.snippet?.thumbnails?.default?.url,
    customUrl: item.snippet?.customUrl,
    subscriberCount: item.statistics?.subscriberCount,
    videoCount: item.statistics?.videoCount,
    viewCount: item.statistics?.viewCount,
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads,
  };
}

export async function fetchRecentUploads(accessToken: string, uploadsPlaylistId?: string, max = 6): Promise<YouTubeVideoSummary[]> {
  if (!uploadsPlaylistId) return [];
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,status&maxResults=${max}&playlistId=${encodeURIComponent(uploadsPlaylistId)}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  return (json.items || []).map((item: Record<string, unknown>) => {
    const snippet = (item.snippet || {}) as Record<string, unknown>;
    const status = (item.status || {}) as Record<string, unknown>;
    const resourceId = (snippet.resourceId || {}) as Record<string, unknown>;
    const videoId = String(resourceId.videoId || '');
    const thumbnails = (snippet.thumbnails || {}) as Record<string, { url?: string }>;
    return {
      id: videoId,
      title: String(snippet.title || ''),
      publishedAt: snippet.publishedAt as string | undefined,
      thumbnail: thumbnails.medium?.url || thumbnails.default?.url,
      privacyStatus: status.privacyStatus as string | undefined,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    } satisfies YouTubeVideoSummary;
  });
}

/**
 * Starts a resumable upload session and returns the session URL.
 * The browser then PUTs the raw video bytes to this URL (no auth header needed),
 * which keeps large files off the serverless function.
 */
export async function initResumableUpload(
  accessToken: string,
  metadata: YouTubeUploadMetadata,
  file: { size: number; contentType: string },
): Promise<{ uploadUrl: string }> {
  const scheduled = Boolean(metadata.publishAt);
  const body = {
    snippet: {
      title: metadata.title.slice(0, 100),
      description: (metadata.description || '').slice(0, 5000),
      tags: metadata.tags && metadata.tags.length ? metadata.tags : undefined,
      categoryId: metadata.categoryId || '22',
    },
    status: {
      // YouTube requires privacy=private when publishAt is set.
      privacyStatus: scheduled ? 'private' : metadata.privacyStatus,
      publishAt: scheduled ? metadata.publishAt : undefined,
      selfDeclaredMadeForKids: Boolean(metadata.madeForKids),
    },
  };

  const res = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(file.size),
        'X-Upload-Content-Type': file.contentType || 'video/*',
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    const message = json?.error?.message || `YouTube upload init failed (${res.status})`;
    throw new Error(message);
  }
  const uploadUrl = res.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube did not return a resumable upload URL');
  return { uploadUrl };
}

export type YouTubeManagedVideo = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacyStatus: string;
  publishAt?: string;
  thumbnail?: string;
  publishedAt?: string;
  viewCount?: string;
  duration?: string;
  url: string;
};

async function ytApi<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/youtube/v3${path}`, {
    ...init,
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as Record<string, { message?: string }>)?.error?.message || `YouTube API failed (${res.status})`);
  }
  return json as T;
}

/** Lists the channel's own videos with the full editable fields. */
export async function listManageableVideos(accessToken: string, uploadsPlaylistId?: string, max = 25): Promise<YouTubeManagedVideo[]> {
  if (!uploadsPlaylistId) return [];
  const playlist = await ytApi<{ items?: Array<{ snippet?: { resourceId?: { videoId?: string } } }> }>(
    accessToken,
    `/playlistItems?part=snippet&maxResults=${max}&playlistId=${encodeURIComponent(uploadsPlaylistId)}`,
  );
  const ids = (playlist.items || []).map(i => i.snippet?.resourceId?.videoId).filter(Boolean) as string[];
  if (!ids.length) return [];
  const videos = await ytApi<{ items?: Array<Record<string, Record<string, unknown>>> }>(
    accessToken,
    `/videos?part=snippet,status,statistics,contentDetails&id=${ids.join(',')}`,
  );
  return (videos.items || []).map(item => {
    const snippet = (item.snippet || {}) as Record<string, unknown>;
    const status = (item.status || {}) as Record<string, unknown>;
    const stats = (item.statistics || {}) as Record<string, unknown>;
    const content = (item.contentDetails || {}) as Record<string, unknown>;
    const thumbs = (snippet.thumbnails || {}) as Record<string, { url?: string }>;
    const id = String(item.id);
    return {
      id,
      title: String(snippet.title || ''),
      description: String(snippet.description || ''),
      tags: Array.isArray(snippet.tags) ? (snippet.tags as string[]) : [],
      categoryId: String(snippet.categoryId || '22'),
      privacyStatus: String(status.privacyStatus || ''),
      publishAt: status.publishAt as string | undefined,
      thumbnail: thumbs.medium?.url || thumbs.default?.url,
      publishedAt: snippet.publishedAt as string | undefined,
      viewCount: stats.viewCount as string | undefined,
      duration: content.duration as string | undefined,
      url: `https://www.youtube.com/watch?v=${id}`,
    } satisfies YouTubeManagedVideo;
  });
}

export type YouTubeVideoPatch = {
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: YouTubePrivacy;
  publishAt?: string | null;
};

/** Updates a video's metadata. Fetches the current snippet/status first so the
 *  required fields (title, categoryId) are preserved when only some change. */
export async function updateVideo(accessToken: string, id: string, patch: YouTubeVideoPatch): Promise<void> {
  const current = await ytApi<{ items?: Array<{ snippet?: Record<string, unknown>; status?: Record<string, unknown> }> }>(
    accessToken,
    `/videos?part=snippet,status&id=${encodeURIComponent(id)}`,
  );
  const item = current.items?.[0];
  if (!item) throw new Error('הסרטון לא נמצא');
  const snippet = (item.snippet || {}) as Record<string, unknown>;
  const status = (item.status || {}) as Record<string, unknown>;

  const scheduled = patch.publishAt != null && patch.publishAt !== '';
  const body = {
    id,
    snippet: {
      title: (patch.title ?? (snippet.title as string) ?? '').slice(0, 100),
      description: (patch.description ?? (snippet.description as string) ?? '').slice(0, 5000),
      tags: patch.tags ?? (snippet.tags as string[] | undefined),
      categoryId: patch.categoryId ?? (snippet.categoryId as string) ?? '22',
    },
    status: {
      privacyStatus: scheduled ? 'private' : (patch.privacyStatus ?? (status.privacyStatus as string)),
      publishAt: scheduled ? patch.publishAt : undefined,
    },
  };
  await ytApi(accessToken, '/videos?part=snippet,status', { method: 'PUT', body: JSON.stringify(body) });
}

export async function deleteVideo(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 204) {
    const json = await res.json().catch(() => ({}));
    throw new Error((json as Record<string, { message?: string }>)?.error?.message || `מחיקה נכשלה (${res.status})`);
  }
}
