import { NextResponse } from 'next/server';
import { hasGoogleConfig, youtubeRedirectUri } from '@/lib/google-auth';
import { readYouTubeConnection } from '@/lib/db';
import { getValidYouTubeAccess, fetchYouTubeChannel, fetchRecentUploads } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

export async function GET() {
  const connection = await readYouTubeConnection().catch(() => null);
  const base = {
    configured: hasGoogleConfig(),
    redirectUri: youtubeRedirectUri(),
    connected: Boolean(connection),
    connection,
  };

  if (!connection) return NextResponse.json(base);

  // Best-effort live channel data; never fail the status call on it.
  try {
    const tokens = await getValidYouTubeAccess();
    const channel = await fetchYouTubeChannel(tokens.accessToken);
    const recentUploads = await fetchRecentUploads(tokens.accessToken, channel?.uploadsPlaylistId);
    return NextResponse.json({ ...base, channel, recentUploads });
  } catch (error) {
    return NextResponse.json({ ...base, channelError: error instanceof Error ? error.message : 'Channel fetch failed' });
  }
}
