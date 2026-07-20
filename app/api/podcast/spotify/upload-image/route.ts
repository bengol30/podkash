import { NextRequest, NextResponse } from 'next/server';
import { uploadPodcastImage } from '@/lib/podcast';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ ok: false, message: 'לא צורפה תמונת פרק' }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await uploadPodcastImage(file, String(form.get('episodeId') || ''))) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'העלאת תמונה נכשלה' }, { status: 400 });
  }
}
