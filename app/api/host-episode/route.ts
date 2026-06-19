import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { readStore, writeStore, getBookings, saveBookings } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ALLOWED = ['title', 'topic', 'status', 'host', 'guests', 'recording', 'recordingAt', 'publish'] as const;

// Admin-only: edit an episode that lives in a specific host's store.
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const hostId = String(body.hostId || '');
  const episodeId = Number(body.episodeId);
  const patch = body.patch && typeof body.patch === 'object' ? body.patch as Record<string, unknown> : {};
  if (!hostId || !Number.isFinite(episodeId)) return NextResponse.json({ error: 'missing hostId/episodeId' }, { status: 400 });

  const storeId = `host:${hostId}`;
  const store = await readStore(storeId);
  const idx = store.episodes.findIndex(e => e.id === episodeId);
  if (idx < 0) return NextResponse.json({ error: 'הפרק לא נמצא' }, { status: 404 });

  const clean: Record<string, string> = {};
  for (const key of ALLOWED) {
    const v = patch[key];
    if (typeof v === 'string' && v.trim() !== '') clean[key] = v.trim();
  }
  store.episodes[idx] = { ...store.episodes[idx], ...clean };
  await writeStore(store, storeId);
  return NextResponse.json({ ok: true, episode: store.episodes[idx] });
}

// Admin-only: fully delete a host's episode + its related tasks/assets/sessions/bookings.
export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const hostId = url.searchParams.get('hostId') || '';
  const episodeId = Number(url.searchParams.get('episodeId'));
  if (!hostId || !Number.isFinite(episodeId)) return NextResponse.json({ error: 'missing hostId/episodeId' }, { status: 400 });

  const storeId = `host:${hostId}`;
  const store = await readStore(storeId);
  const ep = store.episodes.find(e => e.id === episodeId);
  if (!ep) return NextResponse.json({ error: 'הפרק לא נמצא' }, { status: 404 });
  const title = ep.title;
  await writeStore({
    ...store,
    episodes: store.episodes.filter(e => e.id !== episodeId),
    tasks: store.tasks.filter(t => t.episode !== title),
    platforms: store.platforms.filter(p => p.episode !== title),
    sessions: store.sessions.filter(ss => ss.episode?.id !== episodeId && ss.episode?.title !== title),
    messages: store.messages.filter(m => m.target !== title),
  }, storeId);

  // Free the studio slot in the shared calendar.
  const bookings = await getBookings();
  await saveBookings(bookings.filter(b => !(b.ownerHostId === hostId && b.episodeId === episodeId)));
  return NextResponse.json({ ok: true });
}
