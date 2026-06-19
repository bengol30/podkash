import { NextRequest, NextResponse } from 'next/server';
import { syncGoogleDriveEpisodes, ensureHostDriveFolder } from '@/lib/google-drive-sync';
import { getSession } from '@/lib/auth';
import { getHost, setHostDriveFolder } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const body = await request.json().catch(() => ({}));
    const episodeId = body?.episodeId ? Number(body.episodeId) : undefined;

    let storeId: string | undefined;
    let parentFolderId: string | undefined;
    // For a host, episodes live in their own store and nest under their own Drive folder.
    if (session && session.role === 'host') {
      storeId = `host:${session.hostId}`;
      const host = await getHost(session.hostId);
      let folderId = host?.driveFolderId;
      if (!folderId) {
        const folder = await ensureHostDriveFolder(session.name);
        if (folder) { folderId = folder.id; await setHostDriveFolder(session.hostId, folder.id, folder.url || ''); }
      }
      parentFolderId = folderId;
    }

    const result = await syncGoogleDriveEpisodes({
      ...(Number.isFinite(episodeId) ? { episodeId } : {}),
      storeId,
      parentFolderId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Drive sync failed';
    console.error('[google-drive-sync]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
