import { NextResponse } from 'next/server';
import { deleteYouTubeTokens } from '@/lib/db';

export async function POST() {
  await deleteYouTubeTokens();
  return NextResponse.json({ ok: true });
}
