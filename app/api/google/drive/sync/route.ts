import { NextRequest, NextResponse } from 'next/server';
import { syncGoogleDriveEpisodes } from '@/lib/google-drive-sync';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const episodeId = body?.episodeId ? Number(body.episodeId) : undefined;
    const result = await syncGoogleDriveEpisodes(Number.isFinite(episodeId) ? { episodeId } : undefined);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Drive sync failed';
    console.error('[google-drive-sync]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
