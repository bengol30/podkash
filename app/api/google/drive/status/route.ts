import { NextResponse } from 'next/server';
import { hasGoogleConfig, googleRedirectUri } from '@/lib/google-auth';
import { readGoogleDriveConnection } from '@/lib/db';

export async function GET() {
  const connection = await readGoogleDriveConnection().catch(error => ({ error: error instanceof Error ? error.message : 'DB error' }));
  return NextResponse.json({
    configured: hasGoogleConfig(),
    redirectUri: googleRedirectUri(),
    connected: Boolean(connection && !('error' in connection)),
    connection,
  });
}
