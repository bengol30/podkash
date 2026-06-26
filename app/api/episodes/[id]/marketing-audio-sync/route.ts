import { NextRequest, NextResponse } from 'next/server';
import { enqueueMarketingAudioSync } from '@/lib/marketing-audio-sync';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const episodeId = Number(id);
    if (!Number.isFinite(episodeId)) throw new Error('מספר פרק לא תקין');
    const job = await enqueueMarketingAudioSync(episodeId);
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'יצירת משימת סנכרון נכשלה';
    console.error('[marketing-audio-sync:start]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
