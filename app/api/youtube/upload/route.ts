import { NextResponse } from 'next/server';
import { getValidYouTubeAccess } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

/**
 * Returns a short-lived YouTube access token so the browser can run the
 * resumable upload directly against Google. A session initiated server-side
 * has no CORS headers, so the browser PUT is blocked — initiating from the
 * browser (with its Origin) is what makes Google enable CORS. Admin-only
 * (guarded by middleware); the token is scoped to youtube.upload/readonly
 * and expires within the hour.
 */
export async function POST() {
  try {
    const tokens = await getValidYouTubeAccess();
    return NextResponse.json({ ok: true, accessToken: tokens.accessToken, expiresAt: tokens.expiresAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'YouTube token failed';
    const status = message === 'YouTube is not connected' ? 409 : 502;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
