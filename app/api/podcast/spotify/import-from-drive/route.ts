import { NextRequest, NextResponse } from 'next/server';
import { importPodcastAudioFromDrive } from '@/lib/podcast';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sourceEpisodeId = Number(body?.sourceEpisodeId);
    const podcastEpisodeId = body?.podcastEpisodeId ? String(body.podcastEpisodeId) : undefined;
    if (!Number.isFinite(sourceEpisodeId)) return NextResponse.json({ ok: false, message: 'חסר פרק מקור' }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await importPodcastAudioFromDrive(sourceEpisodeId, podcastEpisodeId)) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'ייבוא אודיו מ־Drive נכשל' }, { status: 400 });
  }
}
