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
    // A host syncs their own store; an admin may target a specific host via body.hostId.
    const targetHostId = session?.role === 'host'
      ? session.hostId
      : (session?.role === 'admin' && body?.hostId ? String(body.hostId) : null);
    if (targetHostId) {
      storeId = `host:${targetHostId}`;
      const host = await getHost(targetHostId);
      let folderId = host?.driveFolderId;
      if (!folderId) {
        const folder = await ensureHostDriveFolder(host?.name || (session?.role === 'host' ? session.name : 'מנחה'));
        if (folder) { folderId = folder.id; await setHostDriveFolder(targetHostId, folder.id, folder.url || ''); }
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
