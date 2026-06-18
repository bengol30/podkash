import type { Booking } from './store-types';

export function rangeOverlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

// Single-studio model: any time overlap with an existing booking is a conflict.
export function findConflict(bookings: Booking[], startAt: string, endAt: string, ignoreId?: string): Booking | null {
  const s = Date.parse(startAt);
  const e = Date.parse(endAt);
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  for (const b of bookings) {
    if (ignoreId && b.id === ignoreId) continue;
    const bs = Date.parse(b.startAt);
    const be = Date.parse(b.endAt);
    if (Number.isNaN(bs) || Number.isNaN(be)) continue;
    if (rangeOverlaps(s, e, bs, be)) return b;
  }
  return null;
}

type LegacySession = { startAt?: string; endAt?: string; time?: string; studio?: string; episode?: { id?: number; title?: string } };

// Convert an existing per-host session (string-based time) into a shared Booking.
export function legacySessionToBooking(ss: LegacySession, owner: { hostId: string; name: string }): Booking | null {
  let startAt = ss?.startAt;
  let endAt = ss?.endAt;
  if (!startAt) {
    const raw = String(ss?.time || '');
    const dm = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (!dm) return null;
    let y = Number(dm[3]);
    if (y < 100) y += 2000;
    const month = Number(dm[2]) - 1;
    const day = Number(dm[1]);
    const times = raw.match(/(\d{1,2}):(\d{2})/g) || [];
    if (!times[0]) return null;
    const [sh, sm] = times[0].split(':').map(Number);
    const start = new Date(y, month, day, sh, sm);
    let end: Date;
    if (times[1]) { const [eh, em] = times[1].split(':').map(Number); end = new Date(y, month, day, eh, em); }
    else end = new Date(start.getTime() + 60 * 60000);
    if (end.getTime() <= start.getTime()) end = new Date(start.getTime() + 60 * 60000);
    startAt = start.toISOString();
    endAt = end.toISOString();
  }
  if (!endAt) endAt = new Date(Date.parse(startAt) + 60 * 60000).toISOString();
  return {
    id: `bk_legacy_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    ownerHostId: owner.hostId,
    ownerName: owner.name,
    episodeId: ss?.episode?.id ?? null,
    episodeTitle: ss?.episode?.title || 'צילום',
    studio: ss?.studio || 'אולפן',
    startAt,
    endAt,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  };
}
