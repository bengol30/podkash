import { NextRequest, NextResponse } from 'next/server';
import { uploadPodcastAudio } from '@/lib/podcast';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ ok:false, message:'לא צורף קובץ אודיו' }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await uploadPodcastAudio(file, String(form.get('episodeId') || ''))) });
  } catch (error) {
    return NextResponse.json({ ok:false, message: error instanceof Error ? error.message : 'upload failed' }, { status: 400 });
  }
}
