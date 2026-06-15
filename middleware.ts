import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/join', '/api/auth/login', '/api/applications'];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

async function sha256(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function validSession(value?: string) {
  if (!value) return false;
  const secret = process.env.SESSION_SECRET;
  const password = process.env.ADMIN_PASSWORD;
  if (!secret || !password) return false;
  const expected = await sha256(`${password}:${secret}`);
  return value === expected;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/robots') ||
    pathname.startsWith('/sitemap') ||
    isPublicPath(pathname)
  ) return NextResponse.next();

  if (await validSession(request.cookies.get('podkash_admin')?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!.*\\.).*)'],
};
