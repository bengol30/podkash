import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE, type SessionPayload } from './session';

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export function storeIdForSession(session: SessionPayload | null): string {
  if (!session || session.role === 'admin') return 'default';
  return `host:${session.hostId}`;
}
