import { NextResponse } from 'next/server';
import { hasGoogleConfig, googleRedirectUri } from '@/lib/google-auth';
import { readGoogleDriveConnection, readGoogleDriveTokens } from '@/lib/db';
import { refreshGoogleDriveTokensIfNeeded } from '@/lib/google-drive-sync';

export async function GET() {
  const configured = hasGoogleConfig();
  const connection = await readGoogleDriveConnection().catch(error => ({ error: error instanceof Error ? error.message : 'DB error' }));
  let connected = Boolean(connection && !('error' in connection));
  let error: string | undefined;

  if (connected) {
    try {
      const tokens = await readGoogleDriveTokens();
      if (!tokens) {
        connected = false;
        error = 'Google Drive לא מחובר';
      } else {
        await refreshGoogleDriveTokensIfNeeded(tokens);
      }
    } catch (refreshError) {
      connected = false;
      error = refreshError instanceof Error ? refreshError.message : 'Google Drive token לא תקף';
    }
  }

  return NextResponse.json({
    configured,
    redirectUri: googleRedirectUri(),
    connected,
    reconnectRequired: configured && Boolean(connection) && !connected,
    connection,
    error,
  });
}
