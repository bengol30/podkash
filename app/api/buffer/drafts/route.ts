import { NextRequest, NextResponse } from 'next/server';
import { createBufferDrafts, hasBufferToken } from '@/lib/buffer';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!hasBufferToken()) {
    return NextResponse.json({ ok: false, message: 'Missing BUFFER_ACCESS_TOKEN or BUFFER_API_KEY' }, { status: 400 });
  }
  try {
    const body = await req.json();
    const results = await createBufferDrafts({
      channelIds: body.channelIds,
      text: body.text,
      dueAt: body.dueAt,
      mediaUrl: body.mediaUrl,
      thumbnailUrl: body.thumbnailUrl,
      tiktokTitle: body.tiktokTitle,
      isAiGenerated: body.isAiGenerated,
      saveToDraft: body.saveToDraft,
      mode: body.mode,
      schedulingType: body.schedulingType,
    });
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'Failed to create Buffer drafts' }, { status: 400 });
  }
}
