import { NextResponse } from 'next/server';
import { getUserByUsername, verifyPassword } from '@/lib/db';
import { signSession, SESSION_COOKIE, type SessionPayload } from '@/lib/session';

export const dynamic = 'force-dynamic';

function withSession(payload: SessionPayload, token: string) {
  const res = NextResponse.json({ ok: true, role: payload.role, name: payload.name });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  // Clear the legacy admin cookie if present.
  res.cookies.set('podkash_admin', '', { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 0 });
  return res;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const adminPassword = process.env.ADMIN_PASSWORD;

  // Admin login (backward compatible): no username, or "admin", + ADMIN_PASSWORD.
  if ((!username || username.toLowerCase() === 'admin') && adminPassword && password === adminPassword) {
    const payload: SessionPayload = { uid: 'admin', role: 'admin', hostId: 'default', name: 'מנהל' };
    return withSession(payload, await signSession(payload));
  }

  // Host login by username + password.
  if (username && password) {
    const user = await getUserByUsername(username);
    if (user && verifyPassword(password, user.passwordHash)) {
      const payload: SessionPayload = { uid: user.id, role: user.role, hostId: user.hostId, name: user.name };
      return withSession(payload, await signSession(payload));
    }
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
