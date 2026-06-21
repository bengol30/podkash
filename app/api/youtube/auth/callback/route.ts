import { NextRequest, NextResponse } from 'next/server';
import { youtubeConfig } from '@/lib/google-auth';
import { writeYouTubeTokens } from '@/lib/db';
import { fetchYouTubeChannel } from '@/lib/youtube';

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = request.cookies.get('podkash_youtube_oauth_state')?.value;
  const redirect = new URL('/distribution', url.origin);

  if (!code || !state || !expectedState || state !== expectedState) {
    redirect.searchParams.set('youtube', 'error');
    redirect.searchParams.set('reason', 'state');
    return NextResponse.redirect(redirect);
  }

  try {
    const { clientId, clientSecret, redirectUri } = youtubeConfig();
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenJson.error_description || tokenJson.error || 'YouTube token exchange failed');

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${tokenJson.access_token}` },
    });
    const profile = profileRes.ok ? await profileRes.json() : {};
    const expiresAt = tokenJson.expires_in ? new Date(Date.now() + Number(tokenJson.expires_in) * 1000).toISOString() : undefined;

    // Pull the channel so we can store its title/thumbnail for display.
    let channelTitle: string | undefined;
    let channelThumb: string | undefined;
    try {
      const channel = await fetchYouTubeChannel(tokenJson.access_token);
      channelTitle = channel?.title;
      channelThumb = channel?.thumbnail;
    } catch {
      // Channel fetch is best-effort; connection still succeeds.
    }

    await writeYouTubeTokens({
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      tokenType: tokenJson.token_type,
      scope: tokenJson.scope,
      expiresAt,
      email: profile.email,
      name: channelTitle || profile.name,
      picture: channelThumb || profile.picture,
    });

    redirect.searchParams.set('youtube', 'connected');
    const res = NextResponse.redirect(redirect);
    res.cookies.set('podkash_youtube_oauth_state', '', { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 0 });
    return res;
  } catch (error) {
    console.error('[youtube-oauth-callback]', error);
    redirect.searchParams.set('youtube', 'error');
    return NextResponse.redirect(redirect);
  }
}
