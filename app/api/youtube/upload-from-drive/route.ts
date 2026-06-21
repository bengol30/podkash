import { NextResponse } from 'next/server';
import { getValidYouTubeAccess } from '@/lib/youtube';
import { getValidDriveAccessToken } from '@/lib/google-drive-sync';
import { readStore, writeStore } from '@/lib/db';
import { getSession, storeIdForSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
// Allow a long-running transfer (capped by the Vercel plan's hard limit).
export const maxDuration = 300;

type Body = {
  episodeId?: number;
  hostId?: string;
  driveFileId?: string;
  title?: string;
  description?: string;
  categoryId?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, message: 'Invalid JSON' }, { status: 400 }); }

  const driveFileId = (body.driveFileId || '').trim();
  const title = (body.title || '').trim();
  if (!driveFileId) return NextResponse.json({ ok: false, message: 'חסר מזהה קובץ Drive' }, { status: 400 });
  if (!title) return NextResponse.json({ ok: false, message: 'חסר כותרת' }, { status: 400 });

  try {
    const [driveToken, yt] = await Promise.all([getValidDriveAccessToken(), getValidYouTubeAccess()]);

    // 1. Drive file metadata (need exact byte size + mime for the resumable upload).
    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?fields=size,mimeType,name,videoMediaMetadata`, {
      headers: { authorization: `Bearer ${driveToken}` },
    });
    const meta = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok) throw new Error(meta?.error?.message || 'שליפת קובץ ה-Drive נכשלה');
    const size = Number(meta.size || 0);
    const mime = (meta.mimeType as string) || 'video/*';
    if (!size) throw new Error('קובץ ה-Drive ריק או שאינו קובץ וידאו רגיל');
    if (!mime.startsWith('video/')) throw new Error(`הקובץ ב-Drive אינו וידאו (${mime})`);

    // 2. Open a YouTube resumable upload session (private).
    const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${yt.accessToken}`,
        'content-type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(size),
        'X-Upload-Content-Type': mime,
      },
      body: JSON.stringify({
        snippet: { title: title.slice(0, 100), description: (body.description || '').slice(0, 5000), categoryId: body.categoryId || '22' },
        status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
      }),
    });
    if (!initRes.ok) {
      const j = await initRes.json().catch(() => ({}));
      throw new Error(j?.error?.message || `פתיחת ההעלאה ל-YouTube נכשלה (${initRes.status})`);
    }
    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) throw new Error('YouTube לא החזיר כתובת העלאה');

    // 3. Stream the Drive media straight into the YouTube upload (no buffering).
    const media = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`, {
      headers: { authorization: `Bearer ${driveToken}` },
    });
    if (!media.ok || !media.body) throw new Error(`הורדת הקובץ מ-Drive נכשלה (${media.status})`);

    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Length': String(size), 'Content-Type': mime },
      body: media.body,
      // @ts-expect-error duplex is required by undici for a streaming request body
      duplex: 'half',
    });
    const video = await putRes.json().catch(() => ({}));
    if (!putRes.ok) throw new Error(video?.error?.message || `ההעלאה ל-YouTube נכשלה (${putRes.status})`);

    const videoId = video.id as string | undefined;
    const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : '';

    // 4. Save the link onto the episode in the right store.
    if (videoId && body.episodeId) {
      const storeId = body.hostId ? `host:${body.hostId}` : storeIdForSession(await getSession());
      const store = await readStore(storeId);
      const episodes = store.episodes.map(e => e.id === body.episodeId ? { ...e, youtubeUrl: url } : e);
      await writeStore({ ...store, episodes }, storeId);
    }

    return NextResponse.json({ ok: true, videoId, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ההעלאה מ-Drive ל-YouTube נכשלה';
    const status = message.includes('not connected') ? 409 : 502;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
