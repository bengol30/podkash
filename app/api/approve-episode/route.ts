import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { readStore, writeStore, getBookings, saveBookings, listHosts } from '@/lib/db';
import { findConflict } from '@/lib/bookings';
import type { Booking } from '@/lib/store-types';

export const dynamic = 'force-dynamic';

// Admin: approve a host's episode -> immediately schedule a CONFIRMED studio session
// at the episode's recording date (conflict-checked, shown in the shared calendar).
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const hostId = String(body.hostId || '');
  const episodeId = Number(body.episodeId);
  if (!hostId || !Number.isFinite(episodeId)) return NextResponse.json({ error: 'missing hostId/episodeId' }, { status: 400 });

  const storeId = `host:${hostId}`;
  const store = await readStore(storeId);
  const idx = store.episodes.findIndex(e => e.id === episodeId);
  if (idx < 0) return NextResponse.json({ error: 'הפרק לא נמצא' }, { status: 404 });

  // Optionally update the recording date/time from the request before scheduling.
  if (typeof body.recordingAt === 'string' && body.recordingAt && !Number.isNaN(Date.parse(body.recordingAt))) {
    store.episodes[idx].recordingAt = body.recordingAt;
    if (typeof body.recording === 'string' && body.recording.trim()) store.episodes[idx].recording = body.recording.trim();
  }

  const ep = store.episodes[idx];
  const recAt = ep.recordingAt;
  if (!recAt || Number.isNaN(Date.parse(recAt))) {
    return NextResponse.json({ error: 'קבעו מועד צילום (תאריך ושעה) לפני האישור' }, { status: 400 });
  }
  const startAt = new Date(recAt).toISOString();
  const endAt = new Date(Date.parse(recAt) + 2 * 60 * 60000).toISOString();

  const bookings = await getBookings();
  const existing = bookings.find(b => b.episodeId === episodeId && b.ownerHostId === hostId);
  const conflict = findConflict(bookings, startAt, endAt, existing?.id);
  if (conflict) {
    return NextResponse.json({ error: `הזמן תפוס ביומן (${conflict.episodeTitle}, ${conflict.ownerName})`, conflict }, { status: 409 });
  }

  const host = (await listHosts()).find(h => h.hostId === hostId);
  const ownerName = host?.name || existing?.ownerName || 'מנחה';
  let nextBookings: Booking[];
  if (existing) {
    nextBookings = bookings.map(b => b.id === existing.id ? { ...b, startAt, endAt, status: 'confirmed' as const, episodeTitle: ep.title, studio: b.studio || 'אולפן' } : b);
  } else {
    const booking: Booking = {
      id: `bk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      ownerHostId: hostId, ownerName, episodeId, episodeTitle: ep.title, studio: 'אולפן',
      startAt, endAt, status: 'confirmed', createdAt: new Date().toISOString(),
    };
    nextBookings = [...bookings, booking];
  }
  await saveBookings(nextBookings);

  store.episodes[idx] = { ...ep, status: 'צילום נקבע' };
  await writeStore(store, storeId);
  return NextResponse.json({ ok: true });
}
