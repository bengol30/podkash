import { NextResponse } from 'next/server';
import { googleConfig, GOOGLE_DRIVE_SCOPES } from '@/lib/google-auth';

export async function GET() {
  const { clientId, redirectUri } = googleConfig();
  const state = crypto.randomUUID();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_DRIVE_SCOPES);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  const res = NextResponse.redirect(url);
  res.cookies.set('podkash_google_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 600 });
  return res;
}
