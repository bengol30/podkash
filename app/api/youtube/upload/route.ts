import { NextRequest, NextResponse } from 'next/server';
import { getValidYouTubeAccess, initResumableUpload, type YouTubePrivacy } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

type UploadBody = {
  title?: string;
  description?: string;
  tags?: string[] | string;
  categoryId?: string;
  privacyStatus?: YouTubePrivacy;
  publishAt?: string | null;
  madeForKids?: boolean;
  fileSize?: number;
  contentType?: string;
};

export async function POST(request: NextRequest) {
  let body: UploadBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const title = (body.title || '').trim();
  if (!title) return NextResponse.json({ ok: false, message: 'חסר כותרת לסרטון' }, { status: 400 });

  const fileSize = Number(body.fileSize || 0);
  if (!fileSize || fileSize < 1) return NextResponse.json({ ok: false, message: 'חסר קובץ וידאו תקין' }, { status: 400 });

  const tags = Array.isArray(body.tags)
    ? body.tags
    : typeof body.tags === 'string'
      ? body.tags.split(',').map(t => t.trim()).filter(Boolean)
      : undefined;

  let publishAt: string | undefined;
  if (body.publishAt) {
    const date = new Date(body.publishAt);
    if (Number.isNaN(date.getTime())) return NextResponse.json({ ok: false, message: 'תאריך תזמון לא תקין' }, { status: 400 });
    if (date.getTime() < Date.now()) return NextResponse.json({ ok: false, message: 'זמן התזמון חייב להיות בעתיד' }, { status: 400 });
    publishAt = date.toISOString();
  }

  try {
    const tokens = await getValidYouTubeAccess();
    const { uploadUrl } = await initResumableUpload(
      tokens.accessToken,
      {
        title,
        description: body.description,
        tags,
        categoryId: body.categoryId,
        privacyStatus: body.privacyStatus || 'private',
        publishAt,
        madeForKids: body.madeForKids,
      },
      { size: fileSize, contentType: body.contentType || 'video/*' },
    );
    return NextResponse.json({ ok: true, uploadUrl, scheduled: Boolean(publishAt) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'YouTube upload init failed';
    const status = message === 'YouTube is not connected' ? 409 : 502;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
