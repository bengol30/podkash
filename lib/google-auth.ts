export const GOOGLE_DRIVE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive',
].join(' ');

export function googleRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || 'https://podkash.vercel.app/api/google/auth/callback';
}

export function hasGoogleConfig() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  return { clientId, clientSecret, redirectUri: googleRedirectUri() };
}
