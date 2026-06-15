import { NextResponse } from 'next/server';

async function sha256(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: Request) {
  const { password } = await request.json().catch(() => ({ password: '' }));
  const adminPassword = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!adminPassword || !secret || password !== adminPassword) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = await sha256(`${adminPassword}:${secret}`);
  const res = NextResponse.json({ ok: true });
  res.cookies.set('podkash_admin', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
