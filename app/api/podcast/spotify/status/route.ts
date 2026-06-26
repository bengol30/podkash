import { NextResponse } from 'next/server';
import { getPodcastStatus } from '@/lib/podcast';

export async function GET() {
  try { return NextResponse.json(await getPodcastStatus()); }
  catch (error) { return NextResponse.json({ configured:false, error: error instanceof Error ? error.message : 'status failed' }, { status: 500 }); }
}
