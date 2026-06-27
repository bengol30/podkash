import { NextRequest, NextResponse } from 'next/server';
import { readStore } from '@/lib/db';
import { readGoogleDriveTokens } from '@/lib/db';
import { refreshGoogleDriveTokensIfNeeded } from '@/lib/google-drive-sync';

export const dynamic = 'force-dynamic';

function driveFileIdFromUrl(value?: string) {
  if (!value) return '';
  return value.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] || value.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || '';
}

export async function GET(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const { searchParams } = new URL(request.url);
    const sourceFileId = searchParams.get('fileId') || '';
    const segmentId = searchParams.get('segmentId') || '';
    const segmentIndex = Number(searchParams.get('segmentIndex') || '0');

    const store = await readStore();
    const job = store.marketingAudioSyncJobs?.find(item => item.id === jobId);
    if (!job) return NextResponse.json({ error: 'המשימה לא נמצאה' }, { status: 404 });
    const item = job.items.find(candidate => candidate.fileId === sourceFileId);
    const segment = item?.subtitleSegments?.find(candidate => candidate.id === segmentId || candidate.index === segmentIndex);
    const previewFileId = segment?.previewAudioFileId || driveFileIdFromUrl(segment?.previewAudioUrl);
    if (!previewFileId) return NextResponse.json({ error: 'קטע השמע לא נמצא' }, { status: 404 });

    const rawTokens = await readGoogleDriveTokens();
    if (!rawTokens) return NextResponse.json({ error: 'Google Drive לא מחובר' }, { status: 409 });
    const { tokens } = await refreshGoogleDriveTokensIfNeeded(rawTokens);
    const upstream = await fetch(`https://www.googleapis.com/drive/v3/files/${previewFileId}?alt=media`, {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      cache: 'no-store',
    });
    if (!upstream.ok || !upstream.body) return NextResponse.json({ error: `טעינת קטע השמע נכשלה (${upstream.status})` }, { status: upstream.status });

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'audio/mpeg',
        'cache-control': 'private, max-age=300',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'שגיאה בטעינת קטע השמע' }, { status: 500 });
  }
}
