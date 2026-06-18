import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listHosts, readStore } from '@/lib/db';
import type { Episode } from '@/lib/store-types';

export const dynamic = 'force-dynamic';

// Admin-only: aggregate every host's episodes (tagged with owner) for the unified board.
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const hosts = await listHosts();
  const episodes: Episode[] = [];
  for (const host of hosts) {
    const store = await readStore(`host:${host.hostId}`);
    for (const ep of store.episodes) {
      episodes.push({ ...ep, ownerHostId: host.hostId, ownerName: host.name });
    }
  }
  return NextResponse.json({ episodes });
}
