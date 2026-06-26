import { NextRequest, NextResponse } from 'next/server';
import { markMarketingAudioSyncRead } from '@/lib/marketing-audio-sync';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    await markMarketingAudioSyncRead(jobId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'עדכון הודעה נכשל';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
