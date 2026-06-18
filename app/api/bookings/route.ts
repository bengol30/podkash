import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getBookings, saveBookings, bookingsRowExists, readStore } from '@/lib/db';
import { findConflict, legacySessionToBooking } from '@/lib/bookings';
import type { Booking } from '@/lib/store-types';

export const dynamic = 'force-dynamic';

function sortBookings(list: Booking[]) {
  return [...list].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // One-time migration: seed the shared pool from the admin's existing sessions.
  if (!(await bookingsRowExists())) {
    const adminStore = await readStore('default');
    const seeded = (adminStore.sessions || [])
      .map(ss => legacySessionToBooking(ss as never, { hostId: 'default', name: 'מנהל' }))
      .filter((b): b is Booking => b != null);
    await saveBookings(seeded);
    return NextResponse.json({ bookings: sortBookings(seeded), role: session.role, hostId: session.hostId });
  }

  const bookings = await getBookings();
  return NextResponse.json({ bookings: sortBookings(bookings), role: session.role, hostId: session.hostId });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const startAt = String(body.startAt || '');
  const endAt = String(body.endAt || '');
  const s = Date.parse(startAt);
  const e = Date.parse(endAt);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) {
    return NextResponse.json({ error: 'מועד לא תקין (שעת סיום חייבת להיות אחרי ההתחלה)' }, { status: 400 });
  }

  const bookings = await getBookings();
  const conflict = findConflict(bookings, startAt, endAt);
  if (conflict) {
    return NextResponse.json({
      error: `הזמן תפוס — כבר קיימת הזמנה (${conflict.episodeTitle}, ${conflict.ownerName})`,
      conflict,
    }, { status: 409 });
  }

  const booking: Booking = {
    id: `bk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    ownerHostId: session.hostId,
    ownerName: session.name,
    episodeId: typeof body.episodeId === 'number' ? body.episodeId : null,
    episodeTitle: String(body.episodeTitle || 'צילום').trim() || 'צילום',
    studio: String(body.studio || 'אולפן').trim() || 'אולפן',
    startAt,
    endAt,
    status: session.role === 'admin' ? 'confirmed' : 'pending',
    createdAt: new Date().toISOString(),
  };
  await saveBookings([...bookings, booking]);
  return NextResponse.json({ ok: true, booking });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '');
  const action = String(body.action || '');
  const bookings = await getBookings();
  const target = bookings.find(b => b.id === id);
  if (!target) return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });

  if (action === 'approve') {
    const conflict = findConflict(bookings.filter(b => b.status === 'confirmed'), target.startAt, target.endAt, target.id);
    if (conflict) return NextResponse.json({ error: `אי אפשר לאשר — מתנגש עם ${conflict.episodeTitle} (${conflict.ownerName})`, conflict }, { status: 409 });
    await saveBookings(bookings.map(b => b.id === id ? { ...b, status: 'confirmed' } : b));
    return NextResponse.json({ ok: true });
  }
  if (action === 'reject') {
    await saveBookings(bookings.filter(b => b.id !== id));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'פעולה לא תקינה' }, { status: 400 });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id') || '';
  const bookings = await getBookings();
  const target = bookings.find(b => b.id === id);
  if (!target) return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });
  if (session.role !== 'admin' && target.ownerHostId !== session.hostId) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
  }
  await saveBookings(bookings.filter(b => b.id !== id));
  return NextResponse.json({ ok: true });
}
