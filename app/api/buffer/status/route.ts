import { NextResponse } from 'next/server';
import { getBufferAccountAndChannels, hasBufferToken } from '@/lib/buffer';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!hasBufferToken()) {
    return NextResponse.json({ connected: false, message: 'Missing BUFFER_ACCESS_TOKEN or BUFFER_API_KEY', channels: [] });
  }
  try {
    const data = await getBufferAccountAndChannels();
    return NextResponse.json({ connected: true, ...data });
  } catch (error) {
    return NextResponse.json({ connected: false, message: error instanceof Error ? error.message : 'Buffer connection failed', channels: [] }, { status: 502 });
  }
}
