import { NextRequest, NextResponse } from 'next/server';
import { continueMarketingAudioSyncAfterSubtitleReview, queueMarketingAudioSyncRendering, updateMarketingAudioSyncSubtitles } from '@/lib/marketing-audio-sync';
import { readStore } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const store = await readStore();
    const job = store.marketingAudioSyncJobs?.find(item => item.id === jobId);
    if (!job) return NextResponse.json({ ok: false, error: 'המשימה לא נמצאה' }, { status: 404 });
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'שגיאה בטעינת הכתוביות' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const body = await request.json();
    await updateMarketingAudioSyncSubtitles(jobId, Array.isArray(body.items) ? body.items : []);
    const store = await readStore();
    const job = store.marketingAudioSyncJobs?.find(item => item.id === jobId);
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'שמירת הכתוביות נכשלה' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body.items)) await updateMarketingAudioSyncSubtitles(jobId, body.items);
    if (process.env.VERCEL) {
      await queueMarketingAudioSyncRendering(jobId);
    } else {
      await continueMarketingAudioSyncAfterSubtitleReview(jobId);
    }
    const store = await readStore();
    const job = store.marketingAudioSyncJobs?.find(item => item.id === jobId);
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'המשך התהליך נכשל' }, { status: 500 });
  }
}
